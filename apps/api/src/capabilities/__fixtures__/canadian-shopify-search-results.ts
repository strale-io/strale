/**
 * A real Corporations Canada site-search results page for "Shopify",
 * shared by the parser unit tests and the name-path executor test.
 */
// parseNameSearchResults: fixtures below are trimmed excerpts of the real
// response body captured live 2026-08-14 from a POST to
// fdrlCrpSrch.html?lang=eng with corpName=Shopify (HTTP 200, no cookies).
// Full response had 6 <li> result rows; kept the first two here plus the
// exact "0 results" fixture from a POST for a nonexistent name.
export const SHOPIFY_RESULTS_HTML = `
<ol class="list-unstyled">
    <li class="pad-md row brdr-tp lt-grey">
        <div class="row">
            <div class="col-md-1">1.</div>
            <div class="col-md-11">
                <span>
                <a href="fdrlCrpDtls.html?p=0&amp;corpId=4261607&amp;crpNm=Shopify&amp;crpNmbr=&amp;bsNmbr=&amp;cProv=&amp;cStatus=&amp;cAct="
                   title="426160-7">SHOPIFY INC.</a>
                </span>
                <br/>
                <span>
                Status:
                    Active
                </span>
                <br/>
                <span>
                    Corporation number: 426160-7
                </span>
                <br/>
                <span>
                Business Number:
                    847871746RC0001
                </span>
            </div>
        </div>
    </li>
    <li class="pad-md row brdr-tp">
        <div class="row">
            <div class="col-md-1">2.</div>
            <div class="col-md-11">
                <span>
                <a href="fdrlCrpDtls.html?p=0&amp;corpId=4368525&amp;crpNm=Shopify&amp;crpNmbr=&amp;bsNmbr=&amp;cProv=&amp;cStatus=&amp;cAct="
                   title="436852-5">Shopify Commerce Inc.</a>
                </span>
                <br/>
                <span>
                Status:
                    Dissolved for non-compliance (s. 212)
                </span>
                <br/>
                <span>
                    Corporation number: 436852-5
                </span>
                <br/>
                <span>
                Business Number:
                    851930768RC0001
                </span>
            </div>
        </div>
    </li>
</ol>`;
