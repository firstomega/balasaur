#!/usr/bin/env python3
"""Rebuilds the State of Balasaur artifact HTML from .audit/. Kept in the repo
because the container that generated it has been wiped five times."""
import json, os, re, html

KEYS = [
 ("adsense","AdSense readiness",3.0),("growth","Discovery and growth",3.0),
 ("legal","Legal and privacy compliance",4.0),("ux-flow","User flow and friction",5.0),
 ("ui","UI consistency",5.0),("responsive","Responsiveness and mobile",5.0),
 ("resilience","Edge case resilience and observability",5.0),("dbscale","Database and API scalability",5.0),
 ("seo","SEO and crawlability",5.5),("state","State persistence and recovery",5.5),
 ("deps","Dependency health and code bloat",5.5),("copy","Content and copy consistency",6.5),
 ("perf","Performance and perceived latency",6.5),("quality","Code quality and correctness",6.5),
 ("security","Security",7.0),("a11y","Accessibility",7.0),
]
D=os.path.dirname(os.path.abspath(__file__))
def parse(k):
    t=open(os.path.join(D,f"{k}.md")).read()
    def sec(n,nx):
        m=re.search(rf"{n}:\s*\n(.*?)(?=\n(?:{nx}):|\Z)",t,re.S); return m.group(1).strip() if m else ""
    ag=re.search(r"SCORE_AGREE:\s*(.*)",t)
    return {"agree":ag.group(1).strip() if ag else "",
            "summary":sec("SUMMARY","STRENGTHS|GAPS|METHOD"),
            "strengths":[l.strip()[1:].strip() for l in sec("STRENGTHS","GAPS|METHOD").split("\n") if l.strip().startswith("-")],
            "gaps":[l.strip()[1:].strip() for l in sec("GAPS","METHOD").split("\n") if l.strip().startswith("-")],
            "method":sec("METHOD","$")}
cats=[]
for k,t,s in KEYS:
    c=parse(k); c.update(key=k,title=t,score=s); cats.append(c)
RS=json.load(open(os.path.join(D,'rescore.json')))
for c in cats:
    r=RS.get(c["title"])
    if r:
        c["before"]=r["before"]; c["score"]=r["now"]; c["since"]=r["since"]
A=json.load(open(os.path.join(D,'actions.json')))
acts=A["actions"]; risk=A["biggest_risk"]; note=A.get("status_note","")
W={"AdSense readiness":3,"Discovery and growth":3,"SEO and crawlability":3,
   "Legal and privacy compliance":2,"Content and copy consistency":2,"User flow and friction":2}
def wavg(key):
    num=den=0
    for c in cats:
        w=W.get(c["title"],1); v=c["score"] if key=="now" else c.get("before",c["score"])
        num+=w*v; den+=w
    return num/den
OV_NOW=wavg("now"); OV_BEFORE=wavg("before")
band=lambda s:"crit" if s<4 else("weak" if s<6.5 else "ok")
sev=lambda n:"s5" if n>=5 else("s4" if n==4 else("s3" if n==3 else "s2"))
e=html.escape
def delta(c):
    b=c.get("before")
    if b is None or abs(b-c["score"])<0.01: return '<div class="sc-d">unchanged</div>'
    return f'<div class="sc-d up">was {b:.1f}, now {c["score"]:.1f}</div>'
cards="\n".join(f'<div class="sc {band(c["score"])}"><div class="sc-n">{c["score"]:.1f}</div><div class="sc-t">{e(c["title"])}</div>'
 + delta(c) + '</div>' for c in cats)
def row(a):
    return (f'<tr><td class="rk">{a["rank"]}</td><td class="nm">{e(a["name"])}<span class="why">{e(a["why"])}</span></td>'
            f'<td><span class="chip {sev(a["severity"])}">S{a["severity"]}</span></td>'
            f'<td class="ef">{a["effort"]}</td><td class="ar">{e(a["category"])}<span class="loc">{e(a["area"])}</span></td></tr>')
rows="\n".join(row(a) for a in acts)
def since(c):
    t=c.get("since")
    if not t: return ""
    return f'<p class="since"><b>Since the audit.</b> {e(t)}</p>'
def blk(c):
    st="".join(f"<li>{e(x)}</li>" for x in c["strengths"]) or "<li>Nothing worth naming.</li>"
    gp="".join(f"<li>{e(x)}</li>" for x in c["gaps"])
    dis=f'<p class="dispute">The agent that wrote this disagreed with the score: {e(c["agree"])}</p>' if c["agree"].startswith("no") else ""
    return (f'<details class="cat {band(c["score"])}"><summary><span class="cs">{c["score"]:.1f}</span><span class="ct">{e(c["title"])}</span></summary>'
            f'<div class="cbody">{dis}{since(c)}<p>{e(c["summary"])}</p>'
            f'<div class="two"><div><h4>Holds up</h4><ul class="good">{st}</ul></div>'
            f'<div><h4>Does not</h4><ul class="bad">{gp}</ul></div></div>'
            f'<p class="meth"><b>Method.</b> {e(c["method"])}</p></div></details>')
blocks="\n".join(blk(c) for c in cats)
CSS=open(os.path.join(D,'style.css')).read()
open(os.path.join(D,'..','/tmp/audit.html'.lstrip('/')) if False else '/tmp/audit.html','w').write(f"""<title>State of Balasaur</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>{CSS}</style>
<div class="w">
<header><p class="eyebrow">Re-scored 27 August 2026 · 16 categories · 17 of the first 20 fixed · {len(acts)} open</p>
<h1>State of Balasaur</h1>
<p class="lede">The same 16 categories as the first pass, re-measured against the live database and the current code. Each score carries the number it moved from.</p></header>
<div class="hero"><div class="big">{OV_NOW:.1f}<small>was {OV_BEFORE:.1f}</small></div>
<p><b>The engineering is close to done. The distribution has not started.</b> Seventeen of the twenty findings from the first pass are fixed, and the two that moved most are the two that decide whether anyone ever arrives: the sitemap now points at titles people search for instead of whatever TMDB was trending, and the catalogue is no longer readable or deletable with the key that ships in every visitor's browser. What has not moved is the outcome. Search Console still shows no clicks, and it cannot show any until Google recrawls, which takes weeks. Two items still block an AdSense application and both take under an hour.</p>
<p class="fine">Overall is a weighted mean of the 16 category scores. AdSense readiness, discovery, and search each count triple; legal, content, and user flow count double; the rest count once. The first pass published 4.2 for this number, computed over 8 of 16 categories after an input cap silently truncated the synthesis. Recomputed over all 16, the starting point was 4.6.</p></div>
<section><h2>Scores</h2><div class="grid">{cards}</div></section>
<div class="risk"><h2>The biggest risk</h2><p>{e(risk)}</p></div>
<section><h2>What to do, in order</h2>
<p class="lede" style="font-size:15px">What is left. Seventeen of the first pass’s twenty items are fixed and have been removed from this table rather than marked done; the pull request is the record of those. Two of the eleven below are carried over. Nine are new, found while re-measuring. Ranked by impact divided by effort. Effort S is under an hour.</p>
<div class="tw"><table><thead><tr><th></th><th>Action</th><th>Sev</th><th>Eff</th><th>Area</th></tr></thead><tbody>{rows}</tbody></table></div></section>
<section><h2>Category by category</h2>
<p class="lede" style="font-size:15px">Each written by a specialist that read the code, queried your production database, or rendered the page. Open one for its evidence and its limits.</p>
{blocks}</section>
<section><h2>How much of this to trust</h2><div class="note">
<p><b>Strongest evidence:</b> anything measured against your production database. Content volume, ranking output, table sizes and sitemap contents are real query results, not inference.</p>
<p><b>Weaker:</b> anything about the live site. The audit container had no outbound network, so nobody loaded balasaur.com.</p>
<p><b>Dropped:</b> six severe findings were refuted by a skeptic that went and read the code, and never reached this page. In Wave 3, five of seven fixes came back "needs work" from their verifier, including one that would have stripped rating markup off Seinfeld and The Simpsons.</p>
<p><b>Not yet live:</b> every database change in this report is in production and was verified by query. Every code change sits on one branch behind an open pull request. Until that merges and deploys, a visitor to balasaur.com sees the site as it was before the audit.</p></div></section>
</div>""")
print("regenerated: /tmp/audit.html")
