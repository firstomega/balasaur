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
A=json.load(open(os.path.join(D,'actions.json')))
acts=A["actions"]; risk=A["biggest_risk"]; note=A.get("status_note","")
calib=json.load(open(os.path.join(D,'scores.json')))["calibration"]
band=lambda s:"crit" if s<4 else("weak" if s<6.5 else "ok")
sev=lambda n:"s5" if n>=5 else("s4" if n==4 else("s3" if n==3 else "s2"))
e=html.escape
cards="\n".join(f'<div class="sc {band(c["score"])}"><div class="sc-n">{c["score"]:.1f}</div><div class="sc-t">{e(c["title"])}</div>'
 + (f'<div class="sc-d">agent argues {e(c["agree"].split("give")[-1].strip())}</div>' if c["agree"].startswith("no") else "")+'</div>' for c in cats)
def row(a):
    s=a.get("status","Not started"); c=a.get("commit","")
    cls="done" if s=="Done" else "todo"
    sha=f'<span class="sha">{c}</span>' if c else ''
    return (f'<tr><td class="rk">{a["rank"]}</td><td class="nm">{e(a["name"])}<span class="why">{e(a["why"])}</span></td>'
            f'<td class="stc"><span class="st {cls}">{s}</span>{sha}</td>'
            f'<td><span class="chip {sev(a["severity"])}">S{a["severity"]}</span></td>'
            f'<td class="ef">{a["effort"]}</td><td class="ar">{e(a["category"])}<span class="loc">{e(a["area"])}</span></td></tr>')
rows="\n".join(row(a) for a in acts)
def blk(c):
    st="".join(f"<li>{e(x)}</li>" for x in c["strengths"]) or "<li>Nothing worth naming.</li>"
    gp="".join(f"<li>{e(x)}</li>" for x in c["gaps"])
    dis=f'<p class="dispute">The agent that wrote this disagreed with the score: {e(c["agree"])}</p>' if c["agree"].startswith("no") else ""
    return (f'<details class="cat {band(c["score"])}"><summary><span class="cs">{c["score"]:.1f}</span><span class="ct">{e(c["title"])}</span></summary>'
            f'<div class="cbody">{dis}<p>{e(c["summary"])}</p>'
            f'<div class="two"><div><h4>Holds up</h4><ul class="good">{st}</ul></div>'
            f'<div><h4>Does not</h4><ul class="bad">{gp}</ul></div></div>'
            f'<p class="meth"><b>Method.</b> {e(c["method"])}</p></div></details>')
blocks="\n".join(blk(c) for c in cats)
cal="".join(f"<li>{e(x)}</li>" for x in calib)
ndone=sum(1 for a in acts if a.get("status")=="Done")
CSS=open(os.path.join(D,'style.css')).read()
open(os.path.join(D,'..','/tmp/audit.html'.lstrip('/')) if False else '/tmp/audit.html','w').write(f"""<title>State of Balasaur</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>{CSS}</style>
<div class="w">
<header><p class="eyebrow">Full audit · 16 categories · {ndone} of {len(acts)} fixes shipped</p>
<h1>State of Balasaur</h1>
<p class="lede">Every category scored against evidence, every severe finding put to a skeptic before it reached this page.</p></header>
<div class="hero"><div class="big">4.2<small>overall</small></div>
<p><b>Well-engineered, undistributed, and blocked by things you can fix in an afternoon.</b> The discipline is real: one score component, one card component, a copy lint in CI, an indexability gate that makes it structurally impossible to submit a page that renders noindex. But 79 days of Search Console show 144 impressions and zero clicks, and the sitemap was aimed at what is trending on TMDB rather than at what people search for. The gap between the quality of the code and the outcome of the business is a targeting and finishing problem, not a capability problem.</p></div>
<div class="note" style="border-left:3px solid var(--ok)"><p><b>Progress.</b> {e(note)}</p></div>
<section><h2>Scores</h2><div class="grid">{cards}</div></section>
<div class="risk"><h2>The biggest risk</h2><p>{e(risk)}</p></div>
<section><h2>What to do, in order</h2>
<p class="lede" style="font-size:15px">Ranked by impact divided by effort for a pre-revenue site chasing search traffic. Severity 5 means fix before any traffic arrives; effort S is under an hour.</p>
<div class="tw"><table><thead><tr><th></th><th>Action</th><th>Status</th><th>Sev</th><th>Eff</th><th>Area</th></tr></thead><tbody>{rows}</tbody></table></div></section>
<section><h2>Category by category</h2>
<p class="lede" style="font-size:15px">Each written by a specialist that read the code, queried your production database, or rendered the page. Open one for its evidence and its limits.</p>
{blocks}</section>
<section><h2>Where the scores were argued</h2><div class="note"><p>Different specialists score on different instincts, so a consolidation pass re-read each score against the evidence behind it. These are the ones it would change:</p><ul>{cal}</ul></div></section>
<section><h2>How much of this to trust</h2><div class="note">
<p><b>Strongest evidence:</b> anything measured against your production database. Content volume, ranking output, table sizes and sitemap contents are real query results, not inference.</p>
<p><b>Weaker:</b> anything about the live site. The audit container had no outbound network, so nobody loaded balasaur.com.</p>
<p><b>Dropped:</b> six severe findings were refuted by a skeptic that went and read the code, and never reached this page. In Wave 3, five of seven fixes came back "needs work" from their verifier, including one that would have stripped rating markup off Seinfeld and The Simpsons.</p></div></section>
</div>""")
print("regenerated: /tmp/audit.html")
