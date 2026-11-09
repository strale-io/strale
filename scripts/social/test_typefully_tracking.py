import copy
import unittest
from typefully_tracking import tracked_platforms, Client

PLATFORMS={'x':{'enabled':True,'posts':[{'text':'Try https://strale.io/tools/iban-validate.','media_ids':['example-media']}],'settings':None},'linkedin':{'enabled':False}}
class TrackingTests(unittest.TestCase):
    def test_tagged_links_preserve_media_and_text(self):
        out=tracked_platforms(PLATFORMS,'tools_2026_11','123')
        post=out['x']['posts'][0]
        self.assertIn('utm_source=x',post['text'])
        self.assertIn('utm_content=x-123-p1.',post['text'])
        self.assertEqual(post['media_ids'],['example-media'])
        self.assertNotIn('utm_source',PLATFORMS['x']['posts'][0]['text'])
        self.assertEqual(out,tracked_platforms(out,'tools_2026_11','123'))
    def test_missing_link_and_private_url_rejected(self):
        for text in ['No link','https://example.org','https://strale.io/audit/123?token=secret','https://strale.io/?email=test@example.invalid']:
            p=copy.deepcopy(PLATFORMS);p['x']['posts'][0]['text']=text
            with self.assertRaises(ValueError):tracked_platforms(p,'tools_2026_11','123')
    def test_thread_and_channels(self):
        p=copy.deepcopy(PLATFORMS);p['x']['posts'].append({'text':'A second useful detail.'})
        p['linkedin']={'enabled':True,'posts':[{'text':'Try https://strale.io/docs'}]}
        out=tracked_platforms(p,'tools_2026_11','123')
        self.assertIn('utm_source=linkedin',out['linkedin']['posts'][0]['text'])
        self.assertEqual(out['x']['posts'][1]['text'],'A second useful detail.')
    def test_preserves_confirmation_and_time(self):
        current={'id':123,'status':'scheduled','publish_state':None,'scheduled_date':'2099-01-02T16:00:00Z','updated_at':'v1','platforms':copy.deepcopy(PLATFORMS)}
        writes=[]
        def api(endpoint,method='GET',body=None):
            if endpoint.startswith('/media/'):return {'status':'ready'}
            if endpoint=='/':return {'id':298868,'platforms':{'x':{'username':'strale_io'},'linkedin':{'profile_url':'https://www.linkedin.com/company/strale-io'}}}
            if method=='PATCH':writes.append(body);current['platforms']=body['platforms']
            return copy.deepcopy(current)
        client=Client('test-only',api)
        result=client.request('/drafts/123','PATCH',{},campaign='tools_2026_11')
        self.assertEqual(writes[0]['publish_at'],'2099-01-02T16:00:00Z')
        self.assertEqual(result['status'],'scheduled')
        with self.assertRaises(ValueError):client.request('/drafts/123','PATCH',{'publish_at':'2099-02-02T16:00:00Z'})
        with self.assertRaises(ValueError):client.request('/drafts/123','PATCH',{'plan_at':'2099-01-02T16:00:00Z'})
    def test_detects_lost_confirmation(self):
        current={'id':123,'status':'scheduled','scheduled_date':'2099-01-02T16:00:00Z','platforms':copy.deepcopy(PLATFORMS)}
        def api(endpoint,method='GET',body=None):
            if endpoint.startswith('/media/'):return {'status':'ready'}
            if method=='PATCH':current.update(status='planned',platforms=body['platforms'])
            return copy.deepcopy(current)
        client=Client('test-only',api);client.identity_checked=True
        with self.assertRaises(RuntimeError):client.request('/drafts/123','PATCH',{})
    def test_partial_text_edit_preserves_media_and_settings(self):
        current={'id':123,'status':'scheduled','scheduled_date':'2099-01-02T16:00:00Z','platforms':copy.deepcopy(PLATFORMS)}
        current['platforms']['x']['settings']={'reply_control':'followers'}
        def api(endpoint,method='GET',body=None):
            if endpoint.startswith('/media/'):return {'status':'ready'}
            if method=='PATCH':current['platforms']=body['platforms']
            return copy.deepcopy(current)
        client=Client('test-only',api);client.identity_checked=True
        result=client.request('/drafts/123','PATCH',{'platforms':{'x':{'posts':[{'text':'Updated https://strale.io/docs'}]}}})
        self.assertEqual(result['platforms']['x']['posts'][0]['media_ids'],['example-media'])
        self.assertEqual(result['platforms']['x']['settings'],{'reply_control':'followers'})
if __name__=='__main__':unittest.main()
