"""Strale's scheduling boundary: tag owned links and verify confirmed schedules.

Use Client with an externally supplied API key; credentials are never saved here.
All future create/schedule calls must go through Client.request, not raw HTTP.
"""
import copy
import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

SOCIAL_SET = 298868
URL = re.compile(r'https?://[^\s<>]+')
LABEL = re.compile(r'[a-z0-9][a-z0-9_-]{0,63}\Z')

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def instant(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Publishing time must include its timezone')
    return parsed

def tracked_platforms(platforms, campaign, content_key):
    if not LABEL.fullmatch(campaign) or not LABEL.fullmatch(content_key):
        raise ValueError('Campaign and content key must be safe labels of at most 64 characters')
    result = copy.deepcopy(platforms)
    for channel, config in result.items():
        if not isinstance(config, dict) or not config.get('enabled'):
            continue
        if channel not in ('x', 'linkedin'):
            raise ValueError('This Strale scheduler supports X and LinkedIn only')
        tagged = 0
        for index, post in enumerate(config.get('posts', []), 1):
            content = f'{channel}-{content_key}-p{index}'
            if len(content) > 64:
                raise ValueError('Content label exceeds the website limit')
            def replace(match):
                nonlocal tagged
                raw = match.group().rstrip('.,;!?)')
                suffix = match.group()[len(raw):]
                parts = urlsplit(raw)
                if parts.hostname not in ('strale.io', 'www.strale.io', 'strale.dev', 'www.strale.dev'):
                    return match.group()
                if parts.username or parts.password or parts.port:
                    raise ValueError('Unexpected credential or port in owned URL')
                if re.match(r'^/(audit|topup|wallet|recover)(/|$)', parts.path):
                    raise ValueError('Private or payment URLs must not appear in social posts')
                query = dict(parse_qsl(parts.query, keep_blank_values=True))
                if any(k not in ('utm_source','utm_medium','utm_campaign','utm_content') for k in query):
                    raise ValueError('Review non-campaign query parameters before publishing')
                if parts.fragment:
                    raise ValueError('Review URL fragments before publishing')
                query.update(utm_source=channel, utm_medium='organic_social', utm_campaign=campaign, utm_content=content)
                tagged += 1
                return urlunsplit(('https', 'strale.io', parts.path, urlencode(query), '')) + suffix
            post['text'] = URL.sub(replace, post['text'])
            # X transforms each URL to 23 characters; LinkedIn counts the literal URL.
            length = len(URL.sub('x' * 23, post['text'])) if channel == 'x' else len(post['text'])
            if length > (280 if channel == 'x' else 3000):
                raise ValueError(f'{channel} post {index} exceeds the standard length limit')
        if not tagged:
            raise ValueError(f'{channel}: include at least one relevant Strale link in this post/thread')
    return result

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

class Client:
    def __init__(self, key, transport=None):
        self.key = key
        self.transport = transport or self._http
        self.identity_checked = False

    def _http(self, endpoint, method='GET', body=None):
        req = urllib.request.Request(
            f'https://api.typefully.com/v2/social-sets/{SOCIAL_SET}' + endpoint,
            data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
            method=method, headers={'Authorization':'Bearer '+self.key,'Content-Type':'application/json'})
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=60) as response:
            return json.load(response)

    def verify_identity(self):
        account = self.transport('/')
        require(account['id'] == SOCIAL_SET, 'Wrong social set')
        require(account['platforms']['x']['username'] == 'strale_io', 'Wrong X account')
        require(account['platforms']['linkedin']['profile_url'].rstrip('/') == 'https://www.linkedin.com/company/strale-io', 'Wrong LinkedIn account')
        self.identity_checked = True

    def request(self, endpoint, method='GET', body=None, campaign=None):
        if method == 'GET':
            return self.transport(endpoint, method, body)
        if not self.identity_checked:
            self.verify_identity()
        draft_write = (method == 'POST' and endpoint == '/drafts') or (method == 'PATCH' and re.fullmatch(r'/drafts/\d+', endpoint))
        if not draft_write:
            raise ValueError('Use a separate reviewed operation for non-draft writes')
        body = copy.deepcopy(body or {})
        if 'plan_at' in body:
            raise ValueError('Use publish_at for confirmed schedules; plan_at leaves posts inert')
        before = self.transport(endpoint) if method == 'PATCH' else None
        if before and before['status'] not in ('draft','planned','scheduled'):
            raise ValueError('Do not change a publishing or published post')
        if before and before.get('publish_state'):
            raise ValueError('Publishing is already in progress or finished')
        platforms = body.get('platforms')
        if before:
            merged = copy.deepcopy(before['platforms'])
            for channel, update in (platforms or {}).items():
                old = merged.get(channel) or {}
                config = {**old, **update}
                if 'posts' in update and old.get('posts'):
                    require(len(update['posts']) == len(old['posts']), 'Thread length changes require a separate deliberate operation')
                    config['posts'] = [{**previous, **replacement} for previous, replacement in zip(old['posts'], update['posts'])]
                merged[channel] = config
            platforms = merged
        if not platforms:
            raise ValueError('No platform content to validate')
        existing_sources = []
        for config in platforms.values():
            if isinstance(config,dict) and config.get('enabled'):
                for p in config.get('posts',[]):
                    for match in URL.finditer(p['text']):
                        u=urlsplit(match.group().rstrip('.,;!?)'))
                        if u.hostname == 'strale.io':
                            existing_sources.append(dict(parse_qsl(u.query)).get('utm_campaign'))
        campaign = campaign or next((s for s in existing_sources if s), None) or 'tools_' + datetime.now(timezone.utc).strftime('%Y_%m')
        key = str(before['id']) if before else hashlib.sha256(json.dumps(platforms,sort_keys=True).encode()).hexdigest()[:12]
        expected = tracked_platforms(platforms, campaign, key)
        for config in expected.values():
            if isinstance(config,dict) and config.get('enabled'):
                for post in config.get('posts',[]):
                    for media_id in post.get('media_ids') or []:
                        require(self.transport('/media/'+media_id)['status']=='ready', 'Media is not ready to publish')
        # Omit response-only x_article:null, preserve all enabled platform settings/media.
        body['platforms'] = {k:v for k,v in expected.items() if isinstance(v,dict)}
        expected_time = body.get('publish_at') or (before.get('scheduled_date') if before and before['status']=='scheduled' else None)
        if 'publish_at' in body and body['publish_at'] is None:
            raise ValueError('Unscheduling requires a separate explicit operation')
        if expected_time:
            if expected_time in ('now','next-free-slot') or instant(expected_time) <= datetime.now(timezone.utc):
                raise ValueError('Supply an explicit future publishing time')
            if before and before['status']=='scheduled' and instant(expected_time)!=instant(before['scheduled_date']):
                raise ValueError('This edit must preserve the confirmed publishing time')
            body['publish_at'] = expected_time
        # Optimistic concurrency: abort rather than overwrite a simultaneous editor.
        if before:
            latest = self.transport(endpoint)
            for field in ('updated_at','status','scheduled_date','platforms'):
                if latest.get(field) != before.get(field):
                    raise RuntimeError('Draft changed during preflight; reread before retrying')
        saved = self.transport(endpoint, method, body)
        check = self.transport('/drafts/' + str(saved['id']))
        if expected_time:
            require(check['status']=='scheduled', 'Post is not confirmed; inspect immediately')
            require(instant(check['scheduled_date'])==instant(expected_time), 'Publishing time changed')
        for channel, config in expected.items():
            if not isinstance(config,dict):continue
            got=check['platforms'][channel]
            require(got.get('enabled')==config.get('enabled'), 'Enabled platforms changed')
            if config.get('enabled'):
                require(len(got['posts'])==len(config['posts']), 'Thread changed')
                for wanted, actual in zip(config['posts'],got['posts']):
                    for field,value in wanted.items():
                        require(actual.get(field)==value, f'Post field changed: {field}')
                require(got.get('settings')==config.get('settings'), 'Platform settings changed')
        return check
