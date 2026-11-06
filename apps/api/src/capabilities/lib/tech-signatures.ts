/**
 * Technology signature table for tech-stack-detect and company-tech-stack.
 *
 * Provenance: written by hand for this repository from the public hostnames,
 * file names, headers, cookie names and DNS hostnames that each product's own
 * documentation tells its customers to install or point at. It is NOT derived
 * from Wappalyzer's dataset (no longer open) or webappanalyzer (GPL), and no
 * pattern was copied from either. Add to it the same way: from the vendor's
 * install snippet, never from another detector's fingerprint file.
 *
 * What a signature may look at is limited to what one public fetch of the
 * homepage, its response headers and public DNS (MX, TXT, NS, CNAME) show
 * (DEC-20261023-A). Nothing here asks for a second page.
 *
 * Pattern rules:
 *  - The FIRST capture group of a pattern, when it participates in the match,
 *    is the technology's version. The engine only keeps it if it looks like a
 *    version (starts with a digit, short, no spaces).
 *  - Patterns run on page HTML the target controls. Keep them linear: no
 *    nested quantifiers, bounded gaps (`{0,120}`), never `.*` before another
 *    unbounded quantifier.
 *  - Prefer a vendor host or file name over a bare product word. A bare word
 *    also matches a page that merely MENTIONS the product ("works with
 *    Zendesk"), which is a false positive.
 */

export type Confidence = "high" | "medium" | "low";

export interface TechSignature {
  name: string;
  category: string;
  /** Default "high". Use "medium" when the pattern can also match look-alikes. */
  confidence?: Confidence;
  /**
   * Tested against what the page loads or runs: start tags (script, link,
   * iframe, form; id, class and data- attributes), executable inline script and
   * style bodies, and tracking-pixel images. NOT visible text, `<a>` links,
   * content images or JSON data scripts, so a page that only mentions a vendor
   * does not detect it (see extractActiveMarkup in tech-detect.ts).
   */
  html?: RegExp[];
  /** Tested against HTML comments only (a plugin's "optimized with X vN" banner). */
  comment?: RegExp[];
  /** Header name (lowercase) to a pattern on its value. */
  headers?: Record<string, RegExp>;
  /** Tested against each Set-Cookie cookie NAME. */
  cookies?: RegExp[];
  /** `<meta name=X content=Y>`: name (lowercase) to a pattern on content. */
  meta?: Record<string, RegExp>;
  /** Tested against each MX exchange hostname (lowercase). */
  mx?: RegExp[];
  /** Tested against each TXT record, whole string. */
  txt?: RegExp[];
  /** Tested against each NS hostname (lowercase). */
  ns?: RegExp[];
  /** Tested against each CNAME target (lowercase) of the domain and the fetched host. */
  cname?: RegExp[];
  /** Technologies that are certain consequences of this one. Reported at medium confidence. */
  implies?: string[];
}

/**
 * Categories. The first block is what the capability reported before the
 * signature table existed; names that were already reported keep their
 * original category so a consumer reading `by_category` does not see an
 * existing technology move (Intercom stays under "marketing", for example).
 */
export const TECH_CATEGORIES = [
  // legacy
  "hosting", "cdn", "framework", "security", "analytics", "cms", "ecommerce",
  "marketing", "payment", "monitoring", "css",
  // added with the signature table
  "tag-manager", "advertising", "chat", "crm", "marketing-automation", "email",
  "email-delivery", "dns", "consent", "javascript-library", "font", "video",
  "maps", "auth", "forms", "scheduling", "reviews", "web-server", "language",
  "operating-system", "headless-cms", "site-builder", "ab-testing", "build-tool",
  "support", "search", "icons", "localization", "automation", "feature-flags",
] as const;

export type TechCategory = (typeof TECH_CATEGORIES)[number];

/** A version that can be shown: starts with a digit, short, no spaces. */
export const VERSION_SHAPE = /^\d[\w.+-]{0,30}$/;

export const TECH_SIGNATURES: TechSignature[] = [
  // ─── Web servers, languages, hosting platforms (headers first) ─────────────
  { name: "Nginx", category: "hosting", headers: { server: /nginx(?:\/(\d[\w.]*))?/i } },
  { name: "Apache", category: "hosting", headers: { server: /apache(?!-coyote)(?:\/(\d[\w.]*))?/i } },
  { name: "Cloudflare", category: "cdn", headers: { server: /cloudflare/i, "cf-ray": /.+/ }, cookies: [/^__cf_bm$/, /^cf_clearance$/] },
  { name: "Microsoft IIS", category: "hosting", headers: { server: /microsoft-iis(?:\/(\d[\w.]*))?/i } },
  { name: "Vercel", category: "hosting", headers: { server: /vercel/i, "x-vercel-id": /.+/ } },
  { name: "Netlify", category: "hosting", headers: { server: /netlify/i, "x-netlify-request-id": /.+/ } },
  { name: "Express.js", category: "framework", headers: { "x-powered-by": /express/i }, cookies: [/^connect\.sid$/] },
  { name: "Next.js", category: "framework", headers: { "x-powered-by": /next\.js(?:\s+(\d[\w.]*))?/i, "x-nextjs-cache": /.+/ }, html: [/\/_next\/static\//i, /__NEXT_DATA__/, /<div id=["']__next["']/i, /next\/dist\/client/i], meta: { "next-head-count": /.+/ }, implies: ["React"] },
  { name: "PHP", category: "framework", headers: { "x-powered-by": /php(?:\/(\d[\w.]*))?/i, server: /\bphp(?:\/(\d[\w.]*))?/i }, cookies: [/^PHPSESSID$/] },
  { name: "ASP.NET", category: "framework", headers: { "x-powered-by": /asp\.net/i, "x-aspnet-version": /(\d[\w.]*)/, "x-aspnetmvc-version": /.+/ }, cookies: [/^ASP\.NET_SessionId$/, /^\.AspNetCore\./] },
  { name: "Amazon CloudFront", category: "cdn", headers: { "x-amz-cf-id": /.+/, via: /cloudfront/i, server: /cloudfront/i } },
  { name: "Fastly", category: "cdn", headers: { "x-fastly-request-id": /.+/ } },
  { name: "HSTS", category: "security", headers: { "strict-transport-security": /.+/ } },
  { name: "LiteSpeed", category: "web-server", headers: { server: /litespeed/i, "x-litespeed-cache": /.+/ } },
  { name: "OpenResty", category: "web-server", headers: { server: /openresty(?:\/(\d[\w.]*))?/i } },
  { name: "Caddy", category: "web-server", headers: { server: /caddy/i } },
  { name: "Envoy", category: "web-server", headers: { server: /^envoy$/i } },
  { name: "Gunicorn", category: "web-server", headers: { server: /gunicorn(?:\/(\d[\w.]*))?/i } },
  { name: "Kestrel", category: "web-server", headers: { server: /kestrel/i } },
  { name: "Apache Tomcat", category: "web-server", headers: { server: /apache-coyote/i }, cookies: [/^JSESSIONID$/] },
  { name: "Jetty", category: "web-server", headers: { server: /jetty(?:\((\d[\w.]*)\))?/i } },
  { name: "Phusion Passenger", category: "web-server", headers: { "x-powered-by": /phusion passenger(?:\(R\))?\s*(\d[\w.]*)?/i } },
  { name: "Varnish", category: "cdn", headers: { "x-varnish": /.+/, via: /varnish/i } },
  { name: "Akamai", category: "cdn", headers: { server: /akamaighost|akamainetstorage/i, "x-akamai-transformed": /.+/, "x-akamai-request-id": /.+/ }, cname: [/akamaiedge\.net$|edgekey\.net$|edgesuite\.net$/] },
  { name: "Bunny CDN", category: "cdn", headers: { server: /bunnycdn/i }, html: [/\.b-cdn\.net/i], cname: [/b-cdn\.net$/] },
  { name: "Imperva", category: "security", headers: { "x-iinfo": /.+/, "x-cdn": /imperva/i } },
  { name: "Sucuri", category: "security", headers: { server: /sucuri/i, "x-sucuri-id": /.+/ } },
  { name: "AWS Elastic Load Balancer", category: "hosting", headers: { server: /awselb/i }, cookies: [/^AWSALB(?:CORS)?$/, /^AWSELB$/] },
  { name: "Amazon S3", category: "hosting", headers: { server: /amazons3/i, "x-amz-request-id": /.+/ } },
  { name: "GitHub Pages", category: "hosting", headers: { server: /^github\.com$/i }, cname: [/github\.io$/] },
  { name: "Google Cloud", category: "hosting", headers: { server: /^google frontend$/i, "x-cloud-trace-context": /.+/ }, cname: [/ghs\.googlehosted\.com$|ghs\.google\.com$/] },
  { name: "Microsoft Azure", category: "hosting", headers: { "x-azure-ref": /.+/, "x-ms-request-id": /.+/ }, cname: [/azurewebsites\.net$|azurefd\.net$|trafficmanager\.net$|azureedge\.net$|cloudapp\.azure\.com$/] },
  { name: "Heroku", category: "hosting", headers: { via: /vegur/i }, cname: [/herokudns\.com$|herokuapp\.com$/] },
  { name: "Render", category: "hosting", headers: { "x-render-origin-server": /.+/, server: /^render$/i }, cname: [/onrender\.com$/] },
  { name: "Fly.io", category: "hosting", headers: { "fly-request-id": /.+/, server: /^fly\//i }, cname: [/fly\.dev$/] },
  { name: "Railway", category: "hosting", headers: { server: /railway/i }, cname: [/up\.railway\.app$/] },
  { name: "WP Engine", category: "hosting", headers: { "x-powered-by": /wp engine/i, "x-wpe-loopback-upstream-addr": /.+/, server: /wpengine/i }, cname: [/wpengine\.com$|wpenginepowered\.com$/] },
  { name: "Kinsta", category: "hosting", headers: { "x-kinsta-cache": /.+/ }, cname: [/kinsta\.cloud$/] },
  { name: "Pantheon", category: "hosting", headers: { "x-pantheon-styx-hostname": /.+/ }, cname: [/pantheonsite\.io$/] },
  { name: "Cloudflare Pages", category: "hosting", cname: [/\.pages\.dev$/] },
  { name: "Strapi", category: "headless-cms", headers: { "x-powered-by": /strapi/i } },
  { name: "Craft CMS", category: "cms", headers: { "x-powered-by": /craft cms/i }, cookies: [/^CraftSessionId$/] },
  { name: "Drupal", category: "cms", headers: { "x-generator": /drupal(?:\s+(\d[\w.]*))?/i, "x-drupal-cache": /.+/, "x-drupal-dynamic-cache": /.+/ }, meta: { generator: /^drupal(?:\s+(\d[\w.]*))?/i }, html: [/\/sites\/(?:default|all)\/(?:files|themes|modules)\//i, /drupal-settings-json/i] },
  { name: "Laravel", category: "framework", cookies: [/^laravel_session$/], implies: ["PHP"] },
  { name: "Ruby on Rails", category: "framework", headers: { "x-runtime": /^\d+\.\d+$/ }, meta: { "csrf-param": /^authenticity_token$/ }, html: [/\/assets\/application-[0-9a-f]{8,}\.(?:js|css)/i], implies: ["Ruby"] },
  { name: "Ruby", category: "language" },
  { name: "Django", category: "framework", cookies: [/^csrftoken$/], confidence: "medium", html: [/<input[^>]{0,80}name=["']csrfmiddlewaretoken["']/i], implies: ["Python"] },
  { name: "Python", category: "language" },
  { name: "Ubuntu", category: "operating-system", headers: { server: /\(ubuntu\)/i } },
  { name: "Debian", category: "operating-system", headers: { server: /\(debian\)/i } },
  { name: "CentOS", category: "operating-system", headers: { server: /\(centos\)/i } },
  { name: "Red Hat", category: "operating-system", headers: { server: /\(red hat[^)]*\)/i } },
  { name: "Windows Server", category: "operating-system", headers: { server: /\(win(?:32|64)\)/i } },

  // ─── Analytics, tag managers, session replay ───────────────────────────────
  { name: "Google Analytics", category: "analytics", html: [/google-analytics\.com\/(?:analytics|ga|collect)/i, /gtag\(\s*['"]config['"]/i, /googletagmanager\.com\/gtag\/js\?id=(?:UA|G|AW)-/i, /gtag\/js\?id=G-/i, /\bga\(\s*['"]create['"]/i] },
  { name: "Google Analytics", category: "analytics", confidence: "medium", html: [/google-analytics\.com|googletagmanager\.com|gtag\(/i] },
  { name: "Google Tag Manager", category: "tag-manager", html: [/googletagmanager\.com\/gtm\.js/i, /googletagmanager\.com\/ns\.html/i, /\bGTM-[A-Z0-9]{4,8}\b/] },
  { name: "Hotjar", category: "analytics", html: [/static\.hotjar\.com|hotjar\.com|\bhj\(\s*['"]/i] },
  { name: "Segment", category: "analytics", html: [/segment\.com\/analytics/i, /cdn\.segment\.com/i, /analytics\.load\(/i] },
  { name: "Mixpanel", category: "analytics", html: [/cdn\.mxpnl\.com|mixpanel\.com|mixpanel\.init\(/i] },
  { name: "Plausible", category: "analytics", html: [/plausible\.io/i] },
  { name: "Amplitude", category: "analytics", html: [/amplitude\.com|amplitude\.getInstance\(|cdn\.amplitude\.com/i] },
  { name: "Fathom", category: "analytics", html: [/cdn\.usefathom\.com/i] },
  { name: "Matomo", category: "analytics", html: [/matomo\.(?:js|php)|piwik\.(?:js|php)|_paq\.push/i], meta: { generator: /^matomo/i } },
  { name: "PostHog", category: "analytics", html: [/posthog\.com|posthog\.init\(|\.posthog\.com\/static\/array/i] },
  { name: "Heap", category: "analytics", html: [/cdn\.heapanalytics\.com|heap\.load\(|heapanalytics\.com/i] },
  { name: "FullStory", category: "analytics", html: [/fullstory\.com\/s\/fs\.js|edge\.fullstory\.com|window\._fs_host/i] },
  { name: "Microsoft Clarity", category: "analytics", html: [/(?:www|scripts)\.clarity\.ms\//i, /clarity\.ms\/tag/i] },
  { name: "LogRocket", category: "analytics", html: [/cdn\.logrocket\.(?:com|io)|cdn\.lr-ingest\.io|LogRocket\.init\(/i] },
  { name: "Mouseflow", category: "analytics", html: [/cdn\.mouseflow\.com/i] },
  { name: "Crazy Egg", category: "analytics", html: [/script\.crazyegg\.com/i] },
  { name: "Lucky Orange", category: "analytics", html: [/luckyorange\.(?:com|net)/i] },
  { name: "Pendo", category: "analytics", html: [/cdn\.pendo\.io|pendo\.initialize\(/i] },
  { name: "RudderStack", category: "analytics", html: [/cdn\.rudderlabs\.com|rudderanalytics/i] },
  { name: "Simple Analytics", category: "analytics", html: [/scripts\.simpleanalyticscdn\.com|simpleanalytics\.(?:io|com)\/latest/i] },
  { name: "Cloudflare Web Analytics", category: "analytics", html: [/static\.cloudflareinsights\.com\/beacon/i] },
  { name: "Vercel Analytics", category: "analytics", html: [/\/_vercel\/insights\/script\.js/i, /va\.vercel-scripts\.com/i] },
  { name: "Statcounter", category: "analytics", html: [/statcounter\.com\/counter/i] },
  { name: "Adobe Analytics", category: "analytics", html: [/omniture\.com|2o7\.net|AppMeasurement\.js|adobedtm\.com/i] },
  { name: "Leadfeeder", category: "analytics", html: [/lftracker_v\d+\.js|sc\.lfeeder\.com|leadfeeder\.com/i] },
  { name: "Clearbit", category: "analytics", html: [/tag\.clearbitscripts\.com|reveal\.clearbit\.com|clearbit\.com\/v\d\/tag/i] },
  { name: "ZoomInfo", category: "analytics", html: [/ws\.zoominfo\.com|js\.zi-scripts\.com|zoominfo\.com\/pixel/i] },
  { name: "6sense", category: "analytics", html: [/j\.6sc\.co|6sc\.co\/|epsilon\.6sense\.com/i] },
  { name: "Demandbase", category: "analytics", html: [/tag\.demandbase\.com|api\.demandbase\.com/i] },
  { name: "Apollo", category: "analytics", html: [/assets\.apollo\.io|apollo\.io\/js\/tracker/i] },
  { name: "Warmly", category: "analytics", html: [/opps-widget\.getwarmly\.com|warmly\.ai\/|app\.warmly\.ai/i] },
  { name: "Albacross", category: "analytics", html: [/serve\.albacross\.com/i] },
  { name: "Lusha", category: "analytics", html: [/lusha\.com\/(?:js|script)/i] },
  { name: "Qualified", category: "chat", html: [/js\.qualified\.com|qualified\.com\/plugins/i] },

  // ─── Advertising pixels ────────────────────────────────────────────────────
  { name: "Facebook Pixel", category: "advertising", html: [/connect\.facebook\.net\/[a-z_]{2,6}\/fbevents\.js/i, /\bfbq\(\s*['"]init['"]/i] },
  { name: "LinkedIn Insight Tag", category: "advertising", html: [/snap\.licdn\.com\/li\.lms-analytics/i, /_linkedin_partner_id/i] },
  { name: "Google Ads", category: "advertising", html: [/googleadservices\.com\/pagead\/conversion/i, /googleads\.g\.doubleclick\.net/i, /gtag\(\s*['"]config['"]\s*,\s*['"]AW-/i] },
  { name: "Google AdSense", category: "advertising", html: [/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle/i] },
  { name: "Twitter Ads", category: "advertising", html: [/static\.ads-twitter\.com\/uwt\.js/i, /analytics\.twitter\.com\/i\/adsct/i] },
  { name: "TikTok Pixel", category: "advertising", html: [/analytics\.tiktok\.com\/i18n\/pixel/i, /\bttq\.load\(/i] },
  { name: "Pinterest Tag", category: "advertising", html: [/s\.pinimg\.com\/ct\/core\.js/i, /pintrk\(\s*['"]load['"]/i] },
  { name: "Microsoft Advertising", category: "advertising", html: [/bat\.bing\.com\/bat\.js/i] },
  { name: "Reddit Pixel", category: "advertising", html: [/redditstatic\.com\/ads\/pixel\.js/i] },
  { name: "Criteo", category: "advertising", html: [/static\.criteo\.net|dynamic\.criteo\.com/i] },
  { name: "Quora Pixel", category: "advertising", html: [/a\.quora\.com\/qevents\.js/i] },

  // ─── CMS, site builders, frameworks ────────────────────────────────────────
  { name: "WordPress", category: "cms", meta: { generator: /^WordPress(?:\.com)?(?:\s+v?(\d[\w.]*))?/i }, html: [/wp-content\/|wp-includes\//i, /wp-includes\/[^"'\s?]{0,120}\?ver=(\d+\.\d+(?:\.\d+)?)(?![\w.])/i, /wp-emoji-release\.min\.js\?ver=(\d+\.\d+(?:\.\d+)?)/i, /<link[^>]{0,60}rel=["']https:\/\/api\.w\.org\/["']/i], headers: { link: /api\.w\.org/i, "x-pingback": /xmlrpc\.php/i }, cookies: [/^wordpress_(?:logged_in|test_cookie)/, /^wp-settings-/, /^wp_woocommerce_session_/], implies: ["PHP"] },
  { name: "WooCommerce", category: "ecommerce", meta: { generator: /^WooCommerce(?:\s+v?(\d[\w.]*))?/i }, html: [/woocommerce\/assets\/(?:css\/woocommerce|js\/frontend\/woocommerce)[\w.-]{0,30}\.(?:css|js)\?ver=(\d+\.\d+\.\d+)/i,/wp-content\/plugins\/woocommerce\//i, /\bwoocommerce-(?:no-js|page)\b/i], cookies: [/^woocommerce_(?:items_in_cart|cart_hash)$/] },
  { name: "Elementor", category: "site-builder", meta: { generator: /^Elementor(?:\s+v?(\d[\w.]*))?/i }, html: [/elementor\/assets\/(?:js|css)\/frontend(?:-lite)?(?:\.min)?\.(?:js|css)\?ver=(\d+\.\d+\.\d+)/i,/wp-content\/plugins\/elementor\//i, /\belementor-(?:widget|section|kit)-/i] },
  { name: "Divi", category: "site-builder", html: [/themes\/Divi\/style(?:\.min)?\.css\?ver=(\d+\.\d+\.\d+)/i,/wp-content\/themes\/Divi\//i, /\bet_pb_(?:section|row)\b/i] },
  { name: "WPBakery", category: "site-builder", meta: { generator: /^Powered by WPBakery Page Builder(?:\s+v?(\d[\w.]*))?/i }, html: [/js_composer\/assets\/(?:js\/dist\/js_composer_front|css\/js_composer)[\w.-]{0,30}\.(?:js|css)\?ver=(\d+\.\d+\.\d+)/i,/wp-content\/plugins\/js_composer\//i, /\bvc_row\b/] },
  { name: "Yoast SEO", category: "cms", comment: [/optimized with the Yoast SEO(?: Premium)? plugin v(\d[\w.]*)/i], html: [/yoast-schema-graph/i] },
  { name: "Rank Math", category: "cms", comment: [/Rank Math(?: PRO)? WordPress SEO plugin[^<]{0,40}?v?(\d+\.\d+[\w.]*)/i], html: [/rank-math-schema/i] },
  { name: "Slider Revolution", category: "cms", meta: { generator: /^Powered by Slider Revolution\s+(\d[\w.]*)/i }, html: [/wp-content\/plugins\/revslider\//i] },
  { name: "Contact Form 7", category: "forms", html: [/contact-form-7\/includes\/(?:js|css)\/(?:index|scripts|styles)\.(?:js|css)\?ver=(\d+\.\d+\.\d+)/i,/wp-content\/plugins\/contact-form-7\//i] },
  { name: "Gravity Forms", category: "forms", html: [/wp-content\/plugins\/gravityforms\//i, /\bgform_wrapper\b/] },
  { name: "WP Rocket", category: "cms", comment: [/This website is like a Rocket/i], html: [/wp-content\/plugins\/wp-rocket\//i, /wp-content\/cache\/(?:min|wpr)\b/i] },
  { name: "Joomla", category: "cms", meta: { generator: /^Joomla!?(?:\s+v?(\d[\w.]*))?/i }, html: [/\/media\/jui\/js\//i, /\/media\/system\/js\/core\.js/i], implies: ["PHP"] },
  { name: "Ghost", category: "cms", meta: { generator: /^Ghost(?:\s+(\d[\w.]*))?/i }, html: [/\bdata-ghost=["']https?:/i, /\/ghost\/(?:portal|sodo-search)@/i, /\/content\/themes\/[^"'\s]{1,60}\/assets\/built\//i], cname: [/ghost\.io$/] },
  { name: "Wix", category: "cms", meta: { generator: /^Wix\.com Website Builder/i }, headers: { "x-wix-request-id": /.+/, server: /pepyaka/i }, html: [/static\.wixstatic\.com|static\.parastorage\.com|wixstatic\.com\/media/i, /wix-(?:thunderbolt|dashboard)/i], cname: [/wixdns\.net$/] },
  { name: "Squarespace", category: "cms", meta: { generator: /^Squarespace(?:\s+(\d[\w.]*))?/i }, headers: { server: /^squarespace$/i }, html: [/squarespace-cdn\.com|static1\.squarespace\.com|static\.squarespace\.com\/universal/i, /Squarespace\.(?:afterBodyLoad|Constants)/], cname: [/squarespace\.com$/] },
  { name: "Webflow", category: "cms", meta: { generator: /^Webflow/i }, html: [/data-wf-(?:page|site|domain)=/i, /assets\.website-files\.com|cdn\.prod\.website-files\.com|uploads-ssl\.webflow\.com/i, /\/js\/webflow\.[\w.]*js/i], cname: [/proxy-ssl\.webflow\.com$|proxy\.webflow\.com$|\.webflow\.io$/] },
  { name: "Framer", category: "site-builder", meta: { generator: /^Framer\b/i }, html: [/framerusercontent\.com|events\.framer\.com|framer\.com\/m\//i, /data-framer-(?:name|component-type|hydrate)/i], cname: [/framer\.(?:app|website)$/] },
  { name: "Shopify", category: "ecommerce", html: [/cdn\.shopify\.com/i, /\bShopify\.(?:theme|shop|routes)\b/, /myshopify\.com/i], headers: { "x-shopid": /.+/, "x-shopify-stage": /.+/, "x-sorting-hat-shopid": /.+/, "powered-by": /shopify/i }, cookies: [/^_shopify_[ysa]$/, /^cart_currency$/], meta: { "shopify-checkout-api-token": /.+/, "shopify-digital-wallet": /.+/ }, cname: [/myshopify\.com$/, /shops\.myshopify\.com$/] },
  { name: "BigCommerce", category: "ecommerce", html: [/cdn\d*\.bigcommerce\.com|bigcommerce\.com\/s-[a-z0-9]+/i] },
  { name: "Magento", category: "ecommerce", html: [/\/static\/(?:version\d+\/)?frontend\/Magento\//i, /Magento_[A-Z][a-z]+\//, /mage\/cookies|\bmage-cache-(?:storage|sessid)\b/i], cookies: [/^mage-cache-sessid$/], implies: ["PHP"] },
  { name: "PrestaShop", category: "ecommerce", meta: { generator: /^PrestaShop/i }, html: [/\/modules\/ps_[a-z]+\//i, /prestashop\.(?:com|js)/i] },
  { name: "OpenCart", category: "ecommerce", html: [/catalog\/view\/theme\/[^"'\s]{1,60}\/stylesheet\//i] },
  { name: "Weebly", category: "site-builder", html: [/cdn\d*\.editmysite\.com|weebly\.com\/files|\bweebly-/i] },
  { name: "GoDaddy Website Builder", category: "site-builder", meta: { generator: /go ?daddy website builder\s*(\d[\w.]*)?/i }, html: [/img\d*\.wsimg\.com|\bsecureserver\.net\/website/i] },
  { name: "Carrd", category: "site-builder", html: [/\bcarrd\.co\b/i, /data-carrd-/i] },
  { name: "Hugo", category: "framework", meta: { generator: /^Hugo\s+(\d[\w.]*)/i } },
  { name: "Jekyll", category: "framework", meta: { generator: /^Jekyll\s+v?(\d[\w.]*)/i } },
  { name: "Docusaurus", category: "framework", meta: { generator: /^Docusaurus\s+v?(\d[\w.]*)/i }, html: [/__docusaurus/i] },
  { name: "Eleventy", category: "framework", meta: { generator: /^Eleventy\s+v?(\d[\w.]*)/i } },
  { name: "Hexo", category: "framework", meta: { generator: /^Hexo\s+v?(\d[\w.]*)/i } },
  { name: "Nuxt.js", category: "framework", html: [/\/_nuxt\//i, /window\.__NUXT__|<div id=["']__nuxt["']/i], implies: ["Vue.js"] },
  { name: "Gatsby", category: "framework", confidence: "medium", html: [/gatsby-/i, /___gatsby\b/], meta: { generator: /^Gatsby(?:\s+(\d[\w.]*))?/i }, implies: ["React"] },
  { name: "Angular", category: "framework", html: [/\bng-version=["'](\d[\w.]*)["']/i, /\bng-version\b/i, /<app-root\b/i] },
  { name: "AngularJS", category: "javascript-library", html: [/\bng-app\b/, /angular(?:js)?[/@.-](\d+\.\d+\.\d+)[^"']{0,40}angular(?:\.min)?\.js/i, /angular(?:\.min)?\.js/i] },
  { name: "Astro", category: "framework", meta: { generator: /^Astro\s+v?(\d[\w.]*)/i }, html: [/<astro-island\b|\bdata-astro-cid-|\/_astro\//i] },
  { name: "SvelteKit", category: "framework", html: [/\/_app\/immutable\//i, /__sveltekit_/i], implies: ["Svelte"] },
  { name: "Svelte", category: "javascript-library", confidence: "medium", html: [/\bclass=["'][^"']{0,80}\bsvelte-[a-z0-9]{5,8}\b/i] },
  { name: "Remix", category: "framework", html: [/window\.__remixContext|__remixManifest/i], implies: ["React"] },
  { name: "Qwik", category: "framework", html: [/\bq:container=|\bq:version=["'](\d[\w.]*)["']/i] },
  { name: "React", category: "javascript-library", html: [/\bdata-reactroot\b/i, /__reactContainer\$|_reactRootContainer/, /react(?:-dom)?(?:@|\/)(\d+\.\d+\.\d+)\//i, /react-dom(?:\.production)?(?:\.min)?\.js/i] },
  { name: "Vue.js", category: "javascript-library", html: [/vue(?:@|\/)(\d+\.\d+\.\d+)\/[^"'\s]{0,60}vue(?:\.global|\.runtime)?(?:\.prod)?(?:\.min)?\.js/i, /\bvue(?:\.global|\.runtime)?(?:\.prod)?(?:\.min)?\.js/i, /\bdata-v-[0-9a-f]{8}\b/, /\bdata-server-rendered=["']true["']/i] },
  { name: "jQuery", category: "javascript-library", html: [/jquery[-.](\d+\.\d+\.\d+)(?:\.min)?\.js/i, /jquery(?:\.min)?\.js\?ver=(\d+\.\d+\.\d+)/i, /jquery\/(\d+\.\d+\.\d+)\//i, /jquery@(\d+\.\d+\.\d+)/i, /code\.jquery\.com\/jquery/i, /\bjquery(?:\.min)?\.js\b/i] },
  { name: "jQuery Migrate", category: "javascript-library", html: [/jquery-migrate[-.]?(\d+\.\d+\.\d+)?(?:\.min)?\.js/i] },
  { name: "Alpine.js", category: "javascript-library", html: [/alpinejs(?:@(\d+\.\d+\.\d+))?/i, /\bx-data=["']/i], confidence: "medium" },
  { name: "htmx", category: "javascript-library", html: [/htmx(?:\.org)?(?:@|\/)(\d+\.\d+\.\d+)\//i, /unpkg\.com\/htmx\.org|\/htmx(?:\.min)?\.js|\bhx-(?:get|post|trigger)=/i] },
  { name: "GSAP", category: "javascript-library", html: [/gsap(?:@|\/)(\d+\.\d+\.\d+)\//i, /gsap(?:\.min)?\.js|TweenMax(?:\.min)?\.js|ScrollTrigger(?:\.min)?\.js/i] },
  { name: "Three.js", category: "javascript-library", html: [/three(?:@|\/)(\d+\.\d+\.\d+)\//i, /three(?:\.module)?(?:\.min)?\.js/i], confidence: "medium" },
  { name: "Lottie", category: "javascript-library", html: [/lottie(?:-web|-player)?(?:@|\/)(\d+\.\d+\.\d+)\//i, /lottie(?:\.min)?\.js|lottiefiles\.com|dotlottie/i] },
  { name: "Swiper", category: "javascript-library", html: [/swiper(?:@|\/)(\d+\.\d+\.\d+)\//i, /swiper(?:-bundle)?(?:\.min)?\.(?:js|css)/i] },
  { name: "Lodash", category: "javascript-library", html: [/lodash(?:@|\/)(\d+\.\d+\.\d+)\//i, /lodash(?:\.min)?\.js/i] },
  { name: "Moment.js", category: "javascript-library", html: [/moment(?:@|\/)(\d+\.\d+\.\d+)\//i, /moment(?:-with-locales)?(?:\.min)?\.js/i] },
  { name: "Modernizr", category: "javascript-library", html: [/modernizr[-.]?(\d+\.\d+\.\d+)?(?:\.min)?\.js/i] },
  { name: "Webpack", category: "build-tool", confidence: "medium", html: [/\bwebpackChunk[\w$]*|\bwebpackJsonp\b|__webpack_(?:require|public_path)__/] },
  { name: "Vite", category: "build-tool", confidence: "medium", html: [/\/@vite\/client|<script type=["']module["'] crossorigin src=["']\/assets\/index-[\w-]{6,}\.js/i] },
  { name: "Tailwind CSS", category: "css", confidence: "medium", html: [/tailwindcss v(\d+\.\d+\.\d+)/i, /cdn\.tailwindcss\.com/i, /tailwindcss/i] },
  { name: "Bootstrap", category: "css", html: [/bootstrap(?:@|\/|[-.])v?(\d+\.\d+\.\d+)(?:\/|[-.])/i, /bootstrap(?:\.bundle)?(?:\.min)?\.(?:js|css)(?:\?v=(\d[\w.]*))?/i, /bootstrap\.min|bootstrap\.css/i] },
  { name: "Bulma", category: "css", html: [/bulma(?:@|\/)(\d+\.\d+\.\d+)\//i, /bulma(?:\.min)?\.css/i] },
  { name: "Foundation", category: "css", html: [/foundation(?:@|\/)(\d+\.\d+\.\d+)\//i, /foundation(?:\.min)?\.(?:js|css)/i], confidence: "medium" },
  { name: "Font Awesome", category: "icons", html: [/font-?awesome(?:@|\/|[-.])v?(\d+\.\d+\.\d+)/i, /fontawesome-free(?:@|\/)(\d+\.\d+\.\d+)/i, /fontawesome\.com\/releases\/v(\d+\.\d+\.\d+)/i, /(?:use|kit)\.fontawesome\.com|font-?awesome(?:\.min)?\.css|@fortawesome/i] },
  { name: "Google Fonts", category: "font", html: [/fonts\.googleapis\.com|fonts\.gstatic\.com/i] },
  { name: "Adobe Fonts", category: "font", html: [/use\.typekit\.net|fonts\.adobe\.com/i] },
  { name: "Google Maps", category: "maps", html: [/maps\.googleapis\.com\/maps\/api\/js|maps\.google\.com\/maps\/api/i, /google\.com\/maps\/embed/i] },
  { name: "Mapbox", category: "maps", html: [/api\.mapbox\.com\/mapbox-gl-js\/v(\d+\.\d+\.\d+)/i, /api\.mapbox\.com|mapbox-gl/i] },
  { name: "Leaflet", category: "maps", html: [/leaflet(?:@|\/)(\d+\.\d+\.\d+)\//i, /leaflet(?:-src)?(?:\.min)?\.(?:js|css)/i] },
  { name: "Contentful", category: "headless-cms", html: [/images\.ctfassets\.net|assets\.ctfassets\.net/i] },
  { name: "Sanity", category: "headless-cms", html: [/cdn\.sanity\.io/i] },
  { name: "Prismic", category: "headless-cms", html: [/images\.prismic\.io|prismic\.io\/api/i] },
  { name: "Storyblok", category: "headless-cms", html: [/a\.storyblok\.com|storyblok\.com\/f\//i] },
  { name: "DatoCMS", category: "headless-cms", html: [/datocms-assets\.com/i] },
  { name: "TYPO3", category: "cms", meta: { generator: /^TYPO3(?: CMS)?(?:\s+(\d[\w.]*))?/i }, html: [/\/typo3(?:conf|temp)\//i], implies: ["PHP"] },
  { name: "Umbraco", category: "cms", meta: { generator: /^Umbraco(?:\s+(\d[\w.]*))?/i } },
  { name: "Adobe Experience Manager", category: "cms", html: [/\/etc\.clientlibs\/|\/etc\/designs\/[^"'\s]{1,60}\/clientlibs/i] },
  { name: "Blogger", category: "cms", meta: { generator: /^Blogger/i }, html: [/blogger\.com\/static/i] },
  { name: "Substack", category: "cms", html: [/substackcdn\.com|substack\.com\/api\/v1/i] },
  { name: "Beehiiv", category: "marketing-automation", html: [/beehiiv\.com\/(?:subscribe|embed)|embeds\.beehiiv\.com|media\.beehiiv\.com/i] },
  { name: "Cloudinary", category: "cdn", html: [/res\.cloudinary\.com/i] },
  { name: "imgix", category: "cdn", html: [/\.imgix\.net/i] },
  { name: "jsDelivr", category: "cdn", html: [/cdn\.jsdelivr\.net/i] },
  { name: "cdnjs", category: "cdn", html: [/cdnjs\.cloudflare\.com/i] },
  { name: "unpkg", category: "cdn", html: [/unpkg\.com\//i] },
  { name: "jQuery CDN", category: "cdn", html: [/code\.jquery\.com/i] },
  { name: "Fastly", category: "cdn", cname: [/fastly\.net$/] },
  { name: "Amazon CloudFront", category: "cdn", cname: [/cloudfront\.net$/] },

  // ─── Payments ──────────────────────────────────────────────────────────────
  { name: "Stripe", category: "payment", html: [/js\.stripe\.com/i], cookies: [/^__stripe_(?:mid|sid)$/] },
  { name: "PayPal", category: "payment", html: [/paypal\.com\/sdk|paypalobjects\.com\/api\/checkout\.js|paypal\.com\/(?:checkout|buttons)/i] },
  { name: "Braintree", category: "payment", html: [/js\.braintreegateway\.com|braintree-web/i] },
  { name: "Adyen", category: "payment", html: [/checkoutshopper-(?:live|test)\.adyen\.com|adyen-checkout/i] },
  { name: "Klarna", category: "payment", html: [/x\.klarnacdn\.net|klarna\.com\/(?:web-sdk|us\/shopping)|osm\.klarnaservices\.com/i] },
  { name: "Square", category: "payment", html: [/js\.squareup\.com|web\.squarecdn\.com|squareup\.com\/payments/i] },
  { name: "Paddle", category: "payment", html: [/cdn\.paddle\.com|paddle\.js|Paddle\.Setup\(/i] },
  { name: "Lemon Squeezy", category: "payment", html: [/assets\.lemonsqueezy\.com|\blmsqueezy\.com|lemonsqueezy\.com\/checkout/i] },
  { name: "Chargebee", category: "payment", html: [/js\.chargebee\.com|chargebee\.com\/v\d\//i] },
  { name: "Recurly", category: "payment", html: [/js\.recurly\.com/i] },
  { name: "Razorpay", category: "payment", html: [/checkout\.razorpay\.com/i] },
  { name: "Gumroad", category: "payment", html: [/gumroad\.com\/js\/gumroad\.js/i] },
  { name: "Shop Pay", category: "payment", html: [/shop\.app\/checkouts|shopify\.com\/shop-pay|shop-pay-button/i] },
  { name: "Apple Pay", category: "payment", html: [/ApplePaySession|apple-pay-button/i], confidence: "medium" },
  { name: "Mollie", category: "payment", html: [/js\.mollie\.com/i] },
  { name: "Checkout.com", category: "payment", html: [/cdn\.checkout\.com\/js|checkout-web-components/i] },

  // ─── Marketing, CRM, email marketing ───────────────────────────────────────
  { name: "HubSpot", category: "marketing", html: [/js\.hs-scripts\.com|js\.hsforms\.net|js\.hs-analytics\.net|js\.hs-banner\.com|js\.hscollectedforms\.net|js\.usemessages\.com|forms\.hsforms\.com|hubspotusercontent\d*\.net|\bhs-script-loader\b|\b_hsq\.push/i, /hubspot\.net\/hub\//i], meta: { generator: /^HubSpot/i }, cookies: [/^hubspotutk$/, /^__hs(?:tc|c|sc)$/, /^__hssrc$/], headers: { "x-hs-hub-id": /.+/ }, cname: [/hubspot\.net$|hs-sites\.com$|hscoscdn\d*\.net$/] },
  { name: "Marketo", category: "marketing", html: [/munchkin\.marketo\.net|\bMunchkin\.init\(|mktoForms2|marketo\.com\/js\/forms2/i, /mktdns\.com/i] },
  { name: "Pardot", category: "marketing", html: [/pardot\.com|pi\.pardot\.com|piAId\b/i] },
  { name: "Optimizely", category: "marketing", html: [/cdn\.optimizely\.com|optimizely\.com\/js\//i] },
  { name: "Salesforce", category: "crm", html: [/\.force\.com\/(?:servlet|embeddedservice)|salesforceliveagent\.com|service\.force\.com|\bsalesforce\.com\/servlet/i, /servlet\.WebToLead/i] },
  { name: "Pipedrive", category: "crm", html: [/webforms\.pipedrive\.com|leadbooster-chat\.pipedrive\.com|pipedriveassets\.com/i] },
  { name: "Zoho", category: "crm", html: [/js\.zohocdn\.com|salesiq\.zoho\.(?:com|eu)|zohopublic\.(?:com|eu)|forms\.zohopublic|zsiqchat/i] },
  { name: "Freshworks", category: "crm", html: [/freshsales\.io|freshworks\.com\/(?:js|widget)|wchat\.freshchat\.com|\bfcWidget\.init\b|freshdesk\.com\/(?:js|widget)|euc-widget\.freshworks\.com/i] },
  { name: "ActiveCampaign", category: "marketing-automation", html: [/trackcmp\.net|activehosted\.com|activecampaign\.com\/f\/embed/i] },
  { name: "Mailchimp", category: "marketing-automation", html: [/chimpstatic\.com|list-manage\.com|mailchimp\.com\/(?:embed|js)|\bmc\.us\d+\.list-manage/i] },
  { name: "Klaviyo", category: "marketing-automation", html: [/static\.klaviyo\.com|a\.klaviyo\.com|klaviyo\.com\/onsite|_learnq\.push/i] },
  { name: "Kit", category: "marketing-automation", html: [/f\.convertkit\.com|convertkit\.com\/(?:forms|assets)|\bck\.page\//i, /assets\.kit\.com|kit\.com\/forms/i] },
  { name: "Brevo", category: "marketing-automation", html: [/sibautomation\.com|sendinblue\.com|brevo\.com\/(?:js|form)|sibforms\.com|conversations-widget\.brevo\.com/i] },
  { name: "Customer.io", category: "marketing-automation", html: [/track\.customer\.io|assets\.customer\.io|customerio\.com\/js/i] },
  { name: "Iterable", category: "marketing-automation", html: [/js\.iterable\.com|iterable\.com\/js|links\.iterable\.com/i] },
  { name: "MailerLite", category: "marketing-automation", html: [/assets\.mailerlite\.com|static\.mailerlite\.com|groot\.mailerlite\.com|mailerlite\.com\/(?:js|webforms)/i] },
  { name: "Drip", category: "marketing-automation", html: [/tag\.getdrip\.com|\b_dcq\.push/i] },
  { name: "Constant Contact", category: "marketing-automation", html: [/ctctcdn\.com|constantcontact\.com\/(?:js|signup)/i] },
  { name: "Campaign Monitor", category: "marketing-automation", html: [/createsend1?\.com|campaignmonitor\.com\/(?:js|forms)/i] },
  { name: "Instapage", category: "marketing", html: [/instapage\.com\/(?:js|ajax)|\binstapage-/i, /pageserve\.co/i] },
  { name: "Unbounce", category: "marketing", html: [/unbounce\.com\/(?:js|ub)|ubembed\.com|unbouncepages\.com/i] },
  { name: "Leadpages", category: "marketing", html: [/leadpages\.net|lp-pages\.com|leadpages\.io/i] },
  { name: "Typeform", category: "forms", html: [/embed\.typeform\.com|typeform\.com\/to\//i] },
  { name: "Tally", category: "forms", html: [/tally\.so\/widgets|tally\.so\/embed|tally\.so\/r\//i] },
  { name: "Jotform", category: "forms", html: [/jotform\.com\/(?:jsform|s\/umd)|cdn\.jotfor\.ms/i] },
  { name: "Formspree", category: "forms", html: [/formspree\.io\/(?:f|p)\//i] },
  { name: "Calendly", category: "scheduling", html: [/assets\.calendly\.com|calendly\.com\/[A-Za-z0-9_-]{2,}\/?|Calendly\.initInlineWidget/i] },
  { name: "Chili Piper", category: "scheduling", html: [/chilipiper\.com|js\.chilipiper\.io/i] },
  { name: "Cal.com", category: "scheduling", html: [/app\.cal\.com\/embed|cal\.com\/embed/i] },
  { name: "Trustpilot", category: "reviews", html: [/widget\.trustpilot\.com|invitejs\.trustpilot\.com|\btrustpilot-widget\b/i] },
  { name: "G2", category: "reviews", html: [/share\.g2\.com|\.g2\.com\/(?:widgets|static)|g2crowd\.com\/widgets/i], confidence: "medium" },

  // ─── Chat and support widgets ──────────────────────────────────────────────
  { name: "Intercom", category: "marketing", html: [/widget\.intercom\.io|js\.intercomcdn\.com|intercomSettings|intercom\.io\/widget/i] },
  { name: "Drift", category: "marketing", html: [/js\.driftt\.com|drift\.com\/(?:include|embed)|\bdrift\.load\(/i] },
  { name: "Crisp", category: "marketing", html: [/client\.crisp\.chat|\$crisp\.push|CRISP_WEBSITE_ID/i] },
  { name: "Zendesk", category: "marketing", html: [/static\.zdassets\.com|zendesk\.com\/embeddable|\bze-snippet\b|zopim\.com|v2\.zopim/i] },
  { name: "Tidio", category: "chat", html: [/code\.tidio\.co|tidiochat|tidio\.net/i] },
  { name: "LiveChat", category: "chat", html: [/cdn\.livechatinc\.com|\b__lc\.license\b|livechatinc\.com\/tracking/i] },
  { name: "Tawk.to", category: "chat", html: [/embed\.tawk\.to|tawk\.to\/chat/i] },
  { name: "Olark", category: "chat", html: [/static\.olark\.com|olark\.identify\(/i] },
  { name: "Help Scout", category: "support", html: [/beacon-v2\.helpscout\.net|helpscout\.net\/beacon|Beacon\(['"]init['"]/i] },
  { name: "Gorgias", category: "support", html: [/config\.gorgias\.chat|gorgias\.chat\/gorgias-chat-bundle|gorgias\.io/i] },
  { name: "Chatwoot", category: "chat", html: [/chatwoot\.com\/packs\/js\/sdk|\bchatwootSDK\b|chatwootSettings/i] },
  { name: "Userlike", category: "chat", html: [/userlike-cdn-widgets|userlike\.com\/widget/i] },
  { name: "Front Chat", category: "chat", html: [/chat-assets\.frontapp\.com|frontapp\.com\/chat/i] },
  { name: "Podium", category: "chat", html: [/connect\.podium\.com|podium\.com\/webchat/i] },
  { name: "Zoho SalesIQ", category: "chat", html: [/salesiq\.zoho\.(?:com|eu)|\$zoho\.salesiq/i] },
  { name: "Botpress", category: "chat", html: [/cdn\.botpress\.cloud|botpress\.cloud\/webchat|files\.bpcontent\.cloud/i] },
  { name: "Landbot", category: "chat", html: [/cdn\.landbot\.io|landbot\.io\/(?:landbot-3|v\d)/i] },
  { name: "ManyChat", category: "chat", html: [/manychat\.com\/(?:embed|widget)|widget\.manychat\.com/i] },
  { name: "Voiceflow", category: "chat", html: [/cdn\.voiceflow\.com\/widget/i] },

  // ─── Monitoring, security, auth ────────────────────────────────────────────
  { name: "Sentry", category: "monitoring", html: [/browser\.sentry-cdn\.com\/(\d+\.\d+\.\d+)\//i, /sentry\.io|browser\.sentry-cdn/i, /Sentry\.init\(/] },
  { name: "Datadog", category: "monitoring", html: [/datadoghq\.com|datadoghq-browser-agent|DD_RUM\b/i] },
  { name: "New Relic", category: "monitoring", html: [/newrelic\.com|nr-data\.net|NREUM\b/i] },
  { name: "Bugsnag", category: "monitoring", html: [/d2wy8f7a9ursnm\.cloudfront\.net|bugsnag\.com|Bugsnag\.start\(/i] },
  { name: "Rollbar", category: "monitoring", html: [/cdn\.rollbar\.com|rollbar\.com\/rollbar\.js/i] },
  { name: "Statuspage", category: "monitoring", html: [/statuspage\.io\/embed|\.statuspage\.io/i] },
  { name: "Auth0", category: "security", html: [/auth0\.com|cdn\.auth0\.com/i] },
  { name: "Okta", category: "auth", html: [/okta-signin-widget|\.okta\.com\/(?:login|oauth2)|oktacdn\.com/i] },
  { name: "Clerk", category: "auth", html: [/clerk\.accounts\.dev|clerk\.(?:com|dev)\/npm|\.clerk\.com|__clerk_/i] },
  { name: "Firebase", category: "auth", html: [/gstatic\.com\/firebasejs\/(\d+\.\d+\.\d+)\//i, /firebaseapp\.com|firebaseio\.com|firebase-(?:app|auth)(?:\.js)?/i] },
  { name: "Supabase", category: "auth", html: [/\.supabase\.(?:co|in)\b/i] },
  { name: "reCAPTCHA", category: "security", html: [/google\.com\/recaptcha\/|gstatic\.com\/recaptcha|g-recaptcha\b/i] },
  { name: "hCaptcha", category: "security", html: [/hcaptcha\.com\/1\/api\.js|\bh-captcha\b/i] },
  { name: "Cloudflare Turnstile", category: "security", html: [/challenges\.cloudflare\.com\/turnstile|\bcf-turnstile\b/i] },

  // ─── Consent management ────────────────────────────────────────────────────
  { name: "Cookiebot", category: "consent", html: [/consent\.cookiebot\.com|consentcdn\.cookiebot\.com|\bCookiebot\b/] },
  { name: "OneTrust", category: "consent", html: [/cdn\.cookielaw\.org|onetrust\.com|optanon|otSDKStub/i] },
  { name: "CookieYes", category: "consent", html: [/cdn-cookieyes\.com|cookieyes\.com\/client_data|cky-consent/i] },
  { name: "Termly", category: "consent", html: [/app\.termly\.io|termly\.io\/embed|termly-embed/i] },
  { name: "Osano", category: "consent", html: [/cmp\.osano\.com|osano\.com\/js/i] },
  { name: "iubenda", category: "consent", html: [/cdn\.iubenda\.com|iubenda\.com\/(?:cs|iubenda)|_iub\.csConfiguration/i] },
  { name: "Usercentrics", category: "consent", html: [/app\.usercentrics\.eu|usercentrics\.eu\/(?:browser-ui|bundle)|usercentrics-/i] },
  { name: "Didomi", category: "consent", html: [/sdk\.privacy-center\.org|didomi\.io|window\.didomiConfig/i] },
  { name: "Complianz", category: "consent", html: [/wp-content\/plugins\/complianz-gdpr|cmplz-/i] },
  { name: "Cookie Notice", category: "consent", html: [/wp-content\/plugins\/cookie-notice\//i] },
  { name: "TrustArc", category: "consent", html: [/consent\.trustarc\.com|trustarc\.com\/(?:core|asset)/i] },
  { name: "Axeptio", category: "consent", html: [/static\.axept\.io|axeptio\.eu|axeptioSettings/i] },
  { name: "Cookie Script", category: "consent", html: [/cdn\.cookie-script\.com|cookie-script\.com/i] },

  // ─── Video ─────────────────────────────────────────────────────────────────
  { name: "YouTube", category: "video", html: [/youtube(?:-nocookie)?\.com\/(?:embed|iframe_api)|\/\/www\.youtube\.com\/watch|ytimg\.com/i] },
  { name: "Vimeo", category: "video", html: [/player\.vimeo\.com|f\.vimeocdn\.com/i] },
  { name: "Wistia", category: "video", html: [/fast\.wistia\.(?:com|net)|wistia\.com\/embed|wistia-video/i] },
  { name: "Vidyard", category: "video", html: [/play\.vidyard\.com|fast\.vidyard\.com/i] },
  { name: "Loom", category: "video", html: [/loom\.com\/embed/i] },
  { name: "Mux", category: "video", html: [/stream\.mux\.com|mux-player|mux\.com\/embed/i] },

  // ─── Growth, onboarding and B2B marketing tools ────────────────────────────
  { name: "Weglot", category: "localization", html: [/cdn\.weglot\.com|id=["']weglot-data["']|weglot\.com\/(?:js|api)/i] },
  { name: "Tolt", category: "marketing", html: [/cdn\.tolt\.io|\bdata-tolt=/i] },
  { name: "Tapfiliate", category: "marketing", html: [/script\.tapfiliate\.com|tapfiliate\.com\/tracking/i] },
  { name: "Rewardful", category: "marketing", html: [/r\.wdfl\.co\/rw\.js|rewardful\.com\/js/i] },
  { name: "FirstPromoter", category: "marketing", html: [/cdn\.firstpromoter\.com|firstpromoter\.com\/(?:fpr|js)/i] },
  { name: "PartnerStack", category: "marketing", html: [/js\.partnerstack\.com|partnerstack\.com\/(?:js|widget)/i] },
  { name: "Livestorm", category: "marketing", html: [/app\.livestorm\.co\/(?:p|embed)|livestorm\.co\/(?:embed|assets)/i] },
  { name: "Hellobar", category: "marketing", html: [/my\.hellobar\.com|hellobar\.com\/(?:hellobar|modules)/i] },
  { name: "Canny", category: "support", html: [/sdk\.canny\.io|canny\.io\/sdk|\bCanny\(['"]/i] },
  { name: "Productboard", category: "support", html: [/productboard\.com\/(?:portal|js)|app\.productboard\.com/i] },
  { name: "Zapier", category: "automation", html: [/interfaces\.zapier\.com|zapier\.com\/apps\/embed|zapier-chatbot-embed|zapier-interfaces/i] },
  { name: "Loops", category: "marketing-automation", html: [/app\.loops\.so\/api\/newsletter-form/i] },
  { name: "Web3Forms", category: "forms", html: [/api\.web3forms\.com/i] },
  { name: "Koala", category: "analytics", html: [/cdn\.koala\.live|koala\.live\/v\d|\bwindow\.ko\s*=|ko\.track\(/i] },
  { name: "Common Room", category: "analytics", html: [/cdn\.cr-relay\.com|commonroom\.io\/(?:js|signals)/i] },
  { name: "Reo.Dev", category: "analytics", html: [/static\.reo\.dev|reo\.dev\/(?:js|clearbit)/i] },
  { name: "Unify", category: "analytics", html: [/tag\.unifyintent\.com|unifygtm\.com\/tag/i] },
  { name: "HockeyStack", category: "analytics", html: [/cdn\.hockeystack\.com/i] },
  { name: "Dreamdata", category: "analytics", html: [/cdn\.dreamdata\.cloud/i] },
  { name: "Mutiny", category: "marketing", html: [/client-registry\.mutinycdn\.com|mutinycdn\.com/i] },
  { name: "Navattic", category: "marketing", html: [/js\.navattic\.com|capture\.navattic\.com/i] },
  { name: "Arcade", category: "marketing", html: [/js\.arcade\.software|app\.arcade\.software\/share/i] },
  { name: "Sprig", category: "analytics", html: [/cdn\.sprig\.com|sprig\.com\/(?:sprig|sdk)/i] },
  { name: "Appcues", category: "analytics", html: [/fast\.appcues\.com|appcues\.com\/(?:fast|sdk)/i] },
  { name: "Userpilot", category: "analytics", html: [/js\.userpilot\.io|userpilot\.com\/(?:sdk|js)/i] },
  { name: "VWO", category: "ab-testing", html: [/dev\.visualwebsiteoptimizer\.com|\bvwo_\$|_vwo_code/i] },
  { name: "AB Tasty", category: "ab-testing", html: [/try\.abtasty\.com|abtasty\.com\/(?:js|client)/i] },
  { name: "Convert", category: "ab-testing", html: [/cdn-\d\.convertexperiments\.com|convertexperiments\.com/i] },
  { name: "LaunchDarkly", category: "feature-flags", html: [/clientsdk\.launchdarkly\.com|launchdarkly-js-client-sdk|app\.launchdarkly\.com/i] },
  { name: "Statsig", category: "feature-flags", html: [/statsig-js|cdn\.statsig\.com|featuregates\.org|api\.statsig\.com/i] },
  { name: "Amazon S3", category: "hosting", confidence: "medium", html: [/[\w-]{3,63}\.s3(?:[.-][\w-]{2,20})?\.amazonaws\.com|\/\/s3(?:[.-][\w-]{2,20})?\.amazonaws\.com\//i] },
  { name: "Amazon CloudFront", category: "cdn", confidence: "medium", html: [/\/\/[a-z0-9]{10,16}\.cloudfront\.net\//i] },
  { name: "Google Hosted Libraries", category: "cdn", html: [/ajax\.googleapis\.com\/ajax\/libs\//i] },
  { name: "Netlify Forms", category: "forms", html: [/\bdata-netlify=["']true["']/i] },
  { name: "CookieFirst", category: "consent", html: [/consent\.cookiefirst\.com|cookiefirst\.com\/(?:js|consent)/i] },
  { name: "CookieHub", category: "consent", html: [/cookiehub\.net\/c\d|cookiehub\.net\/[\w-]+\.js/i] },
  { name: "Borlabs Cookie", category: "consent", html: [/wp-content\/plugins\/borlabs-cookie|\bBorlabsCookie\b/i] },
  { name: "HubSpot Meetings", category: "scheduling", html: [/meetings\.hubspot\.com\/|js\.hsmeetings\.com/i] },
  { name: "SavvyCal", category: "scheduling", html: [/savvycal\.com\/embed|embed\.savvycal\.com/i] },

  // ─── Email and domain-verification signals from public DNS ─────────────────
  { name: "Google Workspace", category: "email", mx: [/(?:^|\.)(?:aspmx\.l\.google\.com|googlemail\.com|smtp\.google\.com)$/], txt: [/^v=spf1\b[^]{0,500}\binclude:_spf\.google\.com\b/i] },
  { name: "Microsoft 365", category: "email", mx: [/\.mail\.protection\.outlook\.com$/, /\.mail\.eo\.outlook\.com$/], txt: [/^v=spf1\b[^]{0,500}\binclude:spf\.protection\.outlook\.com\b/i, /^MS=ms\d{5,}$/i] },
  { name: "Proofpoint", category: "email", mx: [/pphosted\.com$|ppe-hosted\.com$/], txt: [/\binclude:(?:_spf\.)?pphosted\.com\b/i] },
  { name: "Mimecast", category: "email", mx: [/mimecast\.com$|mimecast-offshore\.com$/], txt: [/\binclude:(?:[\w-]+\.)?mimecast\.com\b/i] },
  { name: "Zoho Mail", category: "email", mx: [/(?:^|\.)zoho\.(?:com|eu|in|com\.au)$|zohomail\.(?:com|eu)$/], txt: [/\binclude:zoho\.(?:com|eu|in)\b/i, /^zoho-verification=/i] },
  { name: "Proton Mail", category: "email", mx: [/protonmail\.ch$|proton\.me$/], txt: [/\binclude:_spf\.protonmail\.ch\b/i, /^protonmail-verification=/i] },
  { name: "Fastmail", category: "email", mx: [/messagingengine\.com$/], txt: [/\binclude:spf\.messagingengine\.com\b/i] },
  { name: "Rackspace Email", category: "email", mx: [/emailsrvr\.com$/], txt: [/\binclude:emailsrvr\.com\b/i] },
  { name: "GoDaddy Email", category: "email", mx: [/secureserver\.net$/], txt: [/\binclude:secureserver\.net\b/i] },
  { name: "Namecheap Private Email", category: "email", mx: [/privateemail\.com$/], txt: [/\binclude:spf\.privateemail\.com\b/i] },
  { name: "Cloudflare Email Routing", category: "email", mx: [/mx\.cloudflare\.net$/], txt: [/\binclude:_spf\.mx\.cloudflare\.net\b/i] },
  { name: "ImprovMX", category: "email", mx: [/improvmx\.com$/], txt: [/\binclude:spf\.improvmx\.com\b/i] },
  { name: "Forward Email", category: "email", mx: [/forwardemail\.net$/] },
  { name: "IONOS Mail", category: "email", mx: [/(?:^|\.)(?:ionos\.(?:com|de|co\.uk|es|fr)|kundenserver\.de|1and1\.(?:com|co\.uk))$/], txt: [/\binclude:_spf-eu\.ionos\.com\b|\binclude:_spf\.perfora\.net\b/i] },
  { name: "OVHcloud Email", category: "email", mx: [/mail\.ovh\.net$|mx\d*\.ovh\.(?:net|com)$/] },
  { name: "Yandex Mail", category: "email", mx: [/(?:^|\.)mx\.yandex\.(?:net|ru)$/], txt: [/\binclude:_spf\.yandex\.net\b/i] },
  { name: "iCloud Mail", category: "email", mx: [/\.icloud\.com$/], txt: [/\binclude:icloud\.com\b/i, /^apple-domain-verification=/i] },
  { name: "Barracuda", category: "email", mx: [/barracudanetworks\.com$|cudamail\.com$/], txt: [/\binclude:_spf\.ess\.barracudanetworks\.com\b/i] },
  { name: "Gandi Mail", category: "email", mx: [/mail\.gandi\.net$/], txt: [/\binclude:_mailcust\.gandi\.net\b/i] },
  { name: "Migadu", category: "email", mx: [/migadu\.com$/] },
  { name: "Amazon WorkMail", category: "email", mx: [/inbound-smtp\.[a-z0-9-]+\.amazonaws\.com$/] },
  { name: "SendGrid", category: "email-delivery", txt: [/\binclude:(?:[\w-]+\.)?sendgrid\.net\b/i] },
  { name: "Mailgun", category: "email-delivery", mx: [/mailgun\.org$/], txt: [/\binclude:(?:[\w-]+\.)?mailgun\.org\b/i] },
  { name: "Amazon SES", category: "email-delivery", txt: [/\binclude:amazonses\.com\b/i] },
  { name: "Postmark", category: "email-delivery", txt: [/\binclude:spf\.mtasv\.net\b/i] },
  { name: "Mandrill", category: "email-delivery", txt: [/\binclude:spf\.mandrillapp\.com\b/i] },
  { name: "SparkPost", category: "email-delivery", txt: [/\binclude:(?:_spf\.)?sparkpostmail\.com\b/i] },
  { name: "Mailjet", category: "email-delivery", txt: [/\binclude:spf\.mailjet\.com\b/i] },
  { name: "Brevo", category: "marketing-automation", txt: [/\binclude:(?:spf\.brevo\.com|spf\.sendinblue\.com)\b/i, /^brevo-code:/i] },
  { name: "Mailchimp", category: "marketing-automation", txt: [/\binclude:servers\.mcsv\.net\b/i] },
  { name: "HubSpot", category: "marketing", txt: [/\binclude:[\w.-]*\.spf\.hubspotemail\.net\b|\binclude:_spf\.hubspot\.com\b/i, /^hubspot-developer-verification=/i] },
  { name: "Salesforce", category: "crm", txt: [/\binclude:_spf\.salesforce\.com\b|\binclude:salesforce\.com\b/i] },
  { name: "Zendesk", category: "marketing", txt: [/\binclude:mail\.zendesk\.com\b/i] },
  { name: "Campaign Monitor", category: "marketing-automation", txt: [/\binclude:_spf\.createsend\.com\b/i] },
  { name: "Constant Contact", category: "marketing-automation", txt: [/\binclude:spf\.constantcontact\.com\b/i] },
  { name: "Freshworks", category: "crm", txt: [/\binclude:email\.freshdesk\.com\b|\binclude:_spf\.freshworks\.com\b/i] },
  { name: "Atlassian", category: "support", txt: [/^atlassian-domain-verification=/i] },
  { name: "Facebook Business", category: "advertising", txt: [/^facebook-domain-verification=/i] },
  { name: "Stripe", category: "payment", txt: [/^stripe-verification=/i] },
  { name: "DocuSign", category: "support", txt: [/^docusign=/i] },
  { name: "Adobe", category: "support", txt: [/^adobe-idp-site-verification=/i, /^adobe-sign-verification=/i] },
  { name: "Zoom", category: "support", txt: [/^zoom-domain-verification=|^ZOOM_verify_/i] },
  { name: "Miro", category: "support", txt: [/^miro-verification=/i] },
  { name: "OneTrust", category: "consent", txt: [/^onetrust-domain-verification=/i] },
  { name: "Slack", category: "support", txt: [/^slack-domain-verification=/i] },
  { name: "Notion", category: "support", txt: [/^notion-domain-verification=/i] },

  // ─── DNS hosting (NS) ──────────────────────────────────────────────────────
  { name: "Cloudflare DNS", category: "dns", ns: [/\.ns\.cloudflare\.com$/] },
  { name: "Amazon Route 53", category: "dns", ns: [/awsdns-\d+\.(?:com|net|org|co\.uk)$/] },
  { name: "GoDaddy DNS", category: "dns", ns: [/domaincontrol\.com$/] },
  { name: "Google Cloud DNS", category: "dns", ns: [/googledomains\.com$/, /^ns-cloud-[a-e]\d\.googledomains\.com$/] },
  { name: "Azure DNS", category: "dns", ns: [/azure-dns\.(?:com|net|org|info)$/] },
  { name: "Namecheap DNS", category: "dns", ns: [/registrar-servers\.com$/] },
  { name: "NS1", category: "dns", ns: [/nsone\.net$/] },
  { name: "DNSimple", category: "dns", ns: [/dnsimple\.com$/] },
  { name: "UltraDNS", category: "dns", ns: [/ultradns\.(?:com|net|org|biz|info)$/] },
  { name: "Akamai Edge DNS", category: "dns", ns: [/akam\.net$|akamaiedge\.net$/] },
  { name: "Vercel DNS", category: "dns", ns: [/vercel-dns\.com$/] },
  { name: "Squarespace DNS", category: "dns", ns: [/squarespacedns\.com$/] },
  { name: "Wix DNS", category: "dns", ns: [/wixdns\.net$/] },
  { name: "DigitalOcean DNS", category: "dns", ns: [/digitalocean\.com$/] },
  { name: "Linode DNS", category: "dns", ns: [/linode\.com$/] },
  { name: "Hetzner DNS", category: "dns", ns: [/hetzner\.com$|your-server\.de$|first-ns\.de$|second-ns\.(?:de|com)$/] },
  { name: "OVHcloud DNS", category: "dns", ns: [/\.ovh\.net$/] },
  { name: "IONOS DNS", category: "dns", ns: [/ui-dns\.(?:com|de|org|biz)$/] },
  { name: "Gandi DNS", category: "dns", ns: [/gandi\.net$/] },
  { name: "DNS Made Easy", category: "dns", ns: [/dnsmadeeasy\.com$/] },
  { name: "Bluehost DNS", category: "dns", ns: [/bluehost\.com$/] },
];

/**
 * Name aliases so that a name an LLM or another source reports ("CloudFront",
 * "Google Tag Manager") is recognised as one already detected. Lower-case
 * alphanumeric form on both sides.
 */
export const TECH_NAME_ALIASES: Record<string, string> = {
  cloudfront: "amazoncloudfront",
  awscloudfront: "amazoncloudfront",
  gtm: "googletagmanager",
  ga: "googleanalytics",
  ga4: "googleanalytics",
  googleanalytics4: "googleanalytics",
  next: "nextjs",
  nuxt: "nuxtjs",
  vue: "vuejs",
  reactjs: "react",
  express: "expressjs",
  g2crowd: "g2",
  gsuite: "googleworkspace",
  googleapps: "googleworkspace",
  office365: "microsoft365",
  microsoftoffice365: "microsoft365",
  microsoftexchangeonline: "microsoft365",
  route53: "amazonroute53",
  awsroute53: "amazonroute53",
  sendinblue: "brevo",
  convertkit: "kit",
  tawk: "tawkto",
};

export function normalizeTechName(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return TECH_NAME_ALIASES[key] ?? key;
}
