NTA Corporate Number Web-API v4 fixtures, downloaded 2026-10-27 from the
[published April 2022 sample archive](https://www.houjin-bangou.nta.go.jp/pc/download/images/k-sample-dl-r0404.zip).
The archive contains fictional NTA example entities. No application ID is included.

Specification: [v4, revision 1.2, October 2021](https://www.houjin-bangou.nta.go.jp/pc/webapi/images/k-web-api-kinou-ver4.pdf),
with the [overview](https://www.houjin-bangou.nta.go.jp/pc/webapi/images/k-web-api-kinou-gaiyo.pdf)
and [resource definition](https://www.houjin-bangou.nta.go.jp/pc/download/images/k-resource-dl.pdf).

- `num_0_ver4_x4.xml`: byte-for-byte published v4 number response without history,
  §2.3.1 case 3 (`type=12`, XML/UTF-8), including the v4 `hihyoji` flag (§5).
- `name_ver4_x4.xml`: byte-for-byte published v4 name response, §4.3 case 12,
  ten corporations. The ambiguity test uses the whole response.
- `name-single.xml`: first corporation from that name sample, wrapped with the
  same §4.3 XML envelope and count set to one. This is a derived test case,
  not a recorded live query result.
- `closed.xml`: corporation `2310001010007` copied unchanged from the archive's
  `diff_20180509_ver4_x4.xml`, wrapped as a single-record §2.3.1 response.
  `process=21`, `closeCause=01`, `closeDate=2018-05-09` follow resource-definition
  fields 9, 25 and 26. This is a derived envelope around published sample data.
- `not-found.xml`: constructed empty §2.2/§4.2 envelope using the same header
  fields and `count=0`; not captured live. Header values on an actual no-match
  response remain for the orchestrator to verify.

Other tests alter published record fields in memory to exercise resource-definition
process codes 01/11/12/13/21/22/71/72/81/99 and closure reasons 01/11/21/31.
These altered cases are synthetic, not live captures. Registration assignment
is never described as incorporation. `hihyoji=1` indicates search exclusion due
to an obsolete address, not closure.
