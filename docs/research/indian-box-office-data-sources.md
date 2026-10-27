# Indian box office data sources: which to trust, and how to use them

Research for MANA CINEMA. Every page was accessed on 2026-10-23. [S#] points to Section 7. "Inference" marks my own reading, not a source's statement. Figures are rupees crore.

## 1. Bottom line

- No source publishes audited per-film India collections. Per-film figures are all trade estimates or producer claims. The FICCI-EY 2026 report says manual ticketing and data submissions raise credibility concerns about box office data [S21].
- **Main source: Sacnilk** for India net, day by day and lifetime. It is the one source I found that pairs free all-language daily tables with a method page, dated "Updated" stamps and a corrections policy [S2, S3]. The method is generic: platforms and formulas are not disclosed. Label: "Sacnilk estimate, India net, as of [its Updated date]".
- **Cross-check lifetime totals** with Koimoi's closing report (net, gross, overseas) and Ormax (India gross, monthly and annual). Use Box Office India's all-versions reports as a low-side check where one exists (Kalki, Pushpa 2; none found for OG). Use Bollywood Hungama for the Hindi version only.
- **Market totals** (admissions, ticket price): PVR INOX filings, Ormax annual, FICCI-EY. **Producer claims**: separate, unranked, labelled "Producer claim, unverified", with date and day count.
- Your current approach holds only in part. Sacnilk and Koimoi are 0.05% apart on OG India net, 1.1% on Kalki, 2.6% on Pushpa 2. But agreement is not independence: both give OG overseas as 65.25, and Koimoi names no method. Bollywood Hungama's pages for all three films look Hindi-only (inference), so they cannot check totals. Wikipedia is a pointer, not a check.

## 2. Source by source

| Source and owner | Method disclosed? | Covers, update rate | Access and terms | Reliability notes |
|---|---|---|---|---|
| **Sacnilk** (Sacnilk Technologies Pvt Ltd) [S1-S4] | Partly. Own tracking of ticket sales, bookings and occupancy; platforms and formulas undisclosed. Movie pages say "compiled from various sources", which differs | India net, India gross, overseas, worldwide; daily, language, shows, occupancy. Live through the day | Free pages. No terms of use found. Offers "Custom Reports & APIs"; Pro tier paywalled; no price shown | Sells ads to film makers (says no influence). OG state-wise gross table sums 230.93 against headline 229.97 |
| **Box Office India** [S13] | Statement only: "independent estimates", cross-checked with cinema collections | Nett India (Hindi; all versions only for some big films), overseas. Text reports; FAQ says daily figures are adjusted at week end | Free. No API seen | About page says it covers Hindi films. No OG report found. Its Pushpa 2 and Kalki figures run below the others |
| **Bollywood Hungama** (Hungama Digital Media) [S14-S16] | No. "Compiled from various sources and our own research" | India net by day and week; worldwide blank for all three films | Free. Terms bar commercial use without consent | Pages do not state a language; totals match Hindi columns (inference) |
| **Koimoi** (Contests2win.com India Pvt Ltd) [S5-S9] | No method page found. Says numbers "have not been independently verified" | Net, gross, overseas, worldwide; daily and closing articles | Free. No API seen | Closing totals sit above Sacnilk on Kalki and Pushpa 2. Pushpa 2 final gives Telugu as 342.88 in text, 343.88 in list |
| **Ormax Media** [S17-S19] | Partly. "Its own estimates using a mix of reliable industry sources", unnamed. Includes projections for running films | Gross India, footfalls, average ticket price. Monthly report in third week of next month; annual in January. A weekly data product exists (10 languages, from 2015) | Summaries free; data terms and price not public | Clearest on definitions. Per film: gross only, in charts |
| **Producers, distributors** | No | Worldwide gross posters and milestone claims | Public posts; primary posts not read | Own insiders call many inflated (Section 4) |
| **PVR INOX filings** (NSE/BSE) [S20] | Yes, statutory results | One chain: FY26 admissions 150 mn, ATP ₹280; Q1 FY27 36.6 mn, ATP ₹273. Quarterly | Public | First-party but no per-film data |
| **FICCI-EY** [S21] | Partly. EY estimates; film gross at end-customer price; language data came from Ormax and EY says it did not verify it | Annual gross: ₹130 bn (2025) | Free PDF | Aggregate. Its 2024 total (₹114 bn) is below Ormax (₹118.3 bn) |
| **Gower Street / Comscore** [S22] | Cites Comscore tracking | Global, monthly | Terms bar scraping without written consent | Says it lacks "complete tracking" in India |
| **Box Office Mojo** (IMDb) [S23] | No | India row only for Pushpa 2 ($153.5M; basis not stated). None for OG, Kalki | Licence via IMDb on AWS Data Exchange; contact for price | Partial, USD |
| **The Numbers** (OpusData) [S24] | No | India: Pushpa 2 $150.19M (report date 2026-01-29), Kalki $103.44M (2024-12-23), OG none | Licensed REST API, price on request | Partial, stale, USD |
| **CBFC / government** [S25] | Statutory certification | Certification search and statistics; no revenue data seen. No official box office series found | Captcha search form | Not a collections source |
| **BookMyShow** | Could not access | - | - | See Section 6 |

## 3. Three films compared

Net = India after GST. Gross includes GST. Nothing averaged. Sacnilk's lifetime pages show no as-of date, so I give its article "Updated" stamp. Ormax figures include projections for running films.

| Film | Source (type) | India net | India gross | Worldwide gross | Date |
|---|---|---|---|---|---|
| They Call Him OG | Sacnilk (tracker) [S1, S2] | 194.15 | 229.97 | 295.22 | Updated 2026-06-17 |
| | Koimoi closing (tracker) [S5] | 194.05 | 228.97 | 294.22 | Published 2025-10-31 |
| | Ormax (tracker) [S17] | - | 224 | - | Published 2025-10-16 |
| | Bollywood Hungama [S15] | 3.40 | - | - | Page modified 2025-11-07 |
| | DVV Entertainment (producer claim, via Wikipedia) [S26] | - | - | 308 | "21 days" per Wikipedia |
| Pushpa 2 | Sacnilk [S2] | 1,234.10 | 1,471.10 | 1,742.10 | Updated 2025-02-13 |
| | Koimoi final [S7] | 1,265.97 | 1,493.84 | 1,785.84 | Published 2025-02-09 |
| | Ormax annual [S18] | - | 1,403 | - | Published 2025-01-11 |
| | Box Office India [S10] | 1,010.65 (20 days) | 1,220 | - | Published 2024-12-25 |
| | Bollywood Hungama [S14] | 830.10 | - | - | Page modified 2025-08-22 |
| | Mythri Movie Makers (producer claim, via The Wire) [S27] | - | - | 1,831 (32 days) | Posted 2025-01-06 |
| Kalki 2898 AD | Sacnilk [S2] | 646.31 | 767.25 | 1,042.25 | Updated 2024-09-25 |
| | Koimoi closing [S8] | 653.21 | 770.78 | 1,054.67 | Published 2024-08-19 |
| | Box Office India final [S11] | 615 | - | "1000" (text) | Published 2024-10-09 |
| | Ormax annual [S18] | - | "above 500" (threshold only) | - | Published 2025-01-11 |
| | Bollywood Hungama [S15] | 294.25 | - | - | Page modified 2025-09-16 |
| | Vyjayanthi Movies (producer claim, via PTI) [S28] | - | - | "1000+" poster | Reported 2024-07-13 |

Notes:
- Sacnilk's current Pushpa 2 table sums to 1,079.45 at day 20 (24 Dec 2024), or 1,090.10 with previews [S2]; Box Office India said 1,010.65 a day later. Sacnilk revised its table afterwards, so the dates do not match exactly.
- Hindi-version columns: Sacnilk Pushpa 2 812.14, Kalki 293.13, OG 3.36 [S1, S2]; Koimoi Pushpa 2 836.09 [S7]; Box Office India Pushpa 2 about 735.5 (2025-01-21) [S12], Kalki 285 [S11]. The Bollywood Hungama totals fit this Hindi range.

## 4. Disputes and corrections

| Case | What the evidence shows | Type |
|---|---|---|
| OG, Oct 2025 | Koimoi on 2025-10-16 had worldwide at 292.29 and wrote that OG would miss the ₹300 Cr club [S6]. DVV's reported 308 is higher | Tracker versus producer (secondary for the claim) |
| Pushpa 2 | Mythri's 1,831 at day 32 is above both trackers' lifetime totals (1,742.10; 1,785.84) [S27, S2, S7] | Producer claim |
| Kalki, Jul 2024 | Producers reportedly sent legal notices to two analysts who called figures fake. A demand for sources, not a ruling [S29] | Dispute |
| Game Changer, Jan 2025 | Makers claimed 186 worldwide on day one; Ram Gopal Varma called it "fraud" [S30] | Dispute |
| Thamma, Skyforce, Nov 2025 | A producer-distributor said Thamma sold about US$15M, not the reported US$18M; the director defended it. Skyforce block-booking allegations were denied [S31] | Allegations |
| Telugu producer, Jun 2026 | Dil Raju reportedly said publicised numbers are often exaggerated [S32] | Insider admission |
| Box Office India FAQ | Says producer totals are often inflated and cites Delhi Belly, 21 raised to 26 [S13] | Self-reported claim |
| FICCI-EY 2026, p.107 | Smaller towns and South Indian states show "under-declaration of ticket sales" [S21] | Error runs both ways |

Corrections: I found no public correction notice from any tracker. Sacnilk's policy says disagreement with a producer or another tracker is not a reason to change a figure [S3]. The Sacnilk OG table mismatch and the Koimoi 342.88/343.88 mismatch stand uncorrected on the pages I read.

## 5. What this means for MANA CINEMA

**Rules** (my count of source links in `js/films-india.js` and `js/data.js`: 242 of 443 are Sacnilk, 48 Wikipedia, 43 Koimoi, 38 Bollywood Hungama, 8 Box Office India)
1. Primary: Sacnilk India net. Store its "Updated" stamp, not only your fetch date.
2. Cross-check: Koimoi closing totals, plus Ormax gross. Flag a film when two trackers differ by more than a set margin (2% is a suggestion) or when either is still running.
3. Labels: "Trade estimate", "Hindi version only", "Producer claim, unverified", "Gross (includes GST)". Show the spread; do not average.
4. Treat agreement as weak evidence. Koimoi and Sacnilk may share inputs.

**Stop doing**
- Calling Bollywood Hungama a cross-check for all-language totals.
- Using Wikipedia lists as a cross-check. Its Indian cinema task force marks Bollywood Hungama and Box Office India as reliable, and Koimoi and Sacnilk as unreliable. The Sacnilk entry comes from a May 2022 discussion that found no named editorial team [S26]. That is volunteer opinion, not audit.
- Keeping unverified producer notes. `js/data.js` says OG's 308 came "in 11 days"; Wikipedia says 21. It also says Kalki's makers announced 1,100+; I found a 1,000+ poster [S28]. Verify or remove both.
- Converting Box Office Mojo or The Numbers dollar rows into rupees.

**Automated collection** (not legal advice; the terms I read control)

| Source | Allowed? |
|---|---|
| Sacnilk | robots.txt permits /movie, /news, /quicknews [S4]; no terms found. Ask in writing, including about its "Custom Reports & APIs" |
| Koimoi | No. Terms bar robots, scrapers and republishing without permission [S9] |
| Box Office India | robots.txt permits all but /boi-new; no reuse licence in its disclaimer. Ask first [S13] |
| Bollywood Hungama | robots.txt permissive; commercial use needs consent [S16]. Ask first |
| Ormax | robots.txt bars automated collection except under its Content-Usage line (tdm=y) or written permission; disclaimer bars republishing [S19]. Link, do not copy |
| Gower Street | No without written consent [S22] |
| Box Office Mojo, The Numbers | No. Licence only [S23, S24] |
| PVR INOX, FICCI-EY | Public documents; cite by hand. Reuse terms not read |
| CBFC | Captcha form; not automatable [S25] |

**Paid feeds.** The Numbers sells a licensed REST API (pricing on request; reduced academic rates and one-time extracts) [S24]. IMDb licenses Box Office Mojo grosses through AWS Data Exchange (contact for price) [S23]. Sacnilk and Ormax mention paid data with no price [S3, S19]. No source publishes a price.

## 6. Not verified

- BookMyShow: scripts got HTTP 403 and the fetch tool refused. Terms, robots.txt, any API and its annual report are unread.
- Producer posts: all claims reach me through news or Wikipedia, not the posts. DVV's day count is unresolved (11 or 21).
- Box Office India: no OG report found. Its Pushpa 2 nine-week article (id 8964) returned only the homepage, so its final all-versions total is unread.
- Ormax: source mix undisclosed; Kalki's exact figure sits in chart images; whether its Jan 2025 Pushpa 2 figure includes projections.
- Sacnilk: terms (none found); when its method pages first appeared (dated 2026-09-16).
- Comscore current India coverage; PVR INOX occupancy; state ticket portals (Andhra Pradesh, Telangana), seen only in search snippets.
- Whether any tracker's Pushpa 2 or Kalki figures were revised after the dates above.

## 7. Sources (all accessed 2026-10-23)

- S1 Sacnilk movie pages: https://www.sacnilk.com/movie/OG_2024 ; https://www.sacnilk.com/movie/Pushpa_The_Rule_2021 ; https://www.sacnilk.com/movie/Project_K_2024
- S2 Sacnilk day-wise: https://www.sacnilk.com/news/OG_2024_Box_Office_Collection_Day_Wise_Worldwide ; https://www.sacnilk.com/news/Pushpa_The_Rule_2021_Box_Office_Collection_Day_Wise_Worldwide ; https://www.sacnilk.com/news/Project_K_2024_Box_Office_Collection_Day_Wise_Worldwide
- S3 Sacnilk policies: https://www.sacnilk.com/box-office-methodology ; /data-sources-and-estimation ; /corrections-policy ; /editorial-policy ; /about ; /advertise
- S4 https://www.sacnilk.com/robots.txt
- S5 https://www.koimoi.com/box-office/og-worldwide-box-office-closing-collection-pawan-kalyan-scores-career-high-misses-a-major-milestone-by-a-few-crores/
- S6 https://www.koimoi.com/box-office/og-worldwide-box-office-day-21-pawan-kalyan-will-miss-his-one-last-opportunity-at-a-historic-milestone/
- S7 https://www.koimoi.com/box-office/pushpa-2-worldwide-box-office-final-update-finishes-off-its-crazy-theatrical-ride-with-1780-crore-collection/
- S8 https://www.koimoi.com/box-office/kalki-2898-ad-at-the-worldwide-box-office-closing-collection-prabhas-magnum-opus-ends-its-glorious-journey-above-1050-crores-as-7th-highest-grossing-indian-film-of-all-time/
- S9 https://www.koimoi.com/terms-conditions/ ; https://www.koimoi.com/robots.txt ; https://www.koimoi.com/about-us/
- S10 https://www.boxofficeindia.com/report-details.php?articleid=8895
- S11 https://www.boxofficeindia.com/report-details.php?articleid=8730
- S12 https://www.boxofficeindia.com/report-details.php?articleid=8943
- S13 https://www.boxofficeindia.com/content.php?pagekey=about_us ; ...pagekey=faq ; ...pagekey=disclaimer ; https://www.boxofficeindia.com/robots.txt
- S14 https://www.bollywoodhungama.com/movie/pushpa-2-rule/box-office/
- S15 https://www.bollywoodhungama.com/movie/kalki-2898-ad/box-office/ ; https://www.bollywoodhungama.com/movie/they-call-him-og/box-office/
- S16 https://www.bollywoodhungama.com/terms/ ; https://www.bollywoodhungama.com/robots.txt
- S17 https://www.ormaxmedia.com/insights/stories/the-india-box-office-report-september-2025.html
- S18 https://www.ormaxmedia.com/insights/stories/the-ormax-box-office-2024-report.html
- S19 https://www.ormaxmedia.com/services/theatrical.html ; https://www.ormaxmedia.com/stories/ormax-cinematixs-fbo-accuracy-update-july-2026.html ; https://www.ormaxmedia.com/legal-disclaimer.html ; https://www.ormaxmedia.com/robots.txt
- S20 https://nsearchives.nseindia.com/corporate/PVRINOXLTD_23072026131200_PVRINOXPressRelease23072026.pdf ; https://nsearchives.nseindia.com/corporate/PVRINOXLTD_11052026140752_PVRINOXPressRelease11052026.pdf
- S21 https://www.ey.com/content/dam/ey-unified-site/ey-com/en-in/insights/media-entertainment/2026/03/ey-stories-scale-and-impact-un-locking-indias-media-and-entertainment-economy.pdf (PDF pages 107, 121, 324) ; https://www.ey.com/en_in/newsroom/2026/03/india-s-media-and-entertainment-sector-grew-9-percent-to-inr-2-point-78-trillion-in-2025-driven-by-digital-and-live-experiences-ficci-ey-report
- S22 https://gower.st/articles/gower-street-analytics-estimates-2023-global-box-office-hit-33-9-billion/ ; https://www.gower.st/terms/ ; https://www.gower.st/robots.txt
- S23 https://www.boxofficemojo.com/title/tt16539454/ ; /title/tt12735488/ ; /title/tt24060892/ ; https://www.boxofficemojo.com/robots.txt ; https://www.imdb.com/licensing/
- S24 https://www.the-numbers.com/movie/Pushpa-The-Rule-Part-2-(2024-India) ; https://www.the-numbers.com/movie/Kalki-2898-AD-(2024-India) ; https://www.the-numbers.com/movie/They-Call-Him-OG-(2025-India) ; https://www.the-numbers.com/data-services
- S25 https://www.cbfcindia.gov.in/ ; https://www.cbfcindia.gov.in/cbfcAdmin/search-film.php
- S26 Wikipedia, secondary pointers: https://en.wikipedia.org/wiki/They_Call_Him_OG ; https://en.wikipedia.org/wiki/Wikipedia:WikiProject_Film/Indian_cinema_task_force ; https://en.wikipedia.org/wiki/Wikipedia_talk:WikiProject_Film/Indian_cinema_task_force/Archive_7
- S27 https://m.thewire.in/article/film/income-tax-department-raids-pushpa-2-director-sukumars-residence (secondary)
- S28 https://www.dtnext.in/entertainment/cinema/kalki-2898-ad-crosses-rs-1000-crore-mark-at-box-office-makers-call-it-celebration-of-love-794676 (secondary)
- S29 https://thesouthfirst.com/entertainment/telugu/makers-of-kalki-2898-ad-sue-trade-analysts-for-posting-fake-bo-online/ (secondary)
- S30 https://www.hollywoodreporterindia.com/features/insight/ram-gopal-varma-calls-game-changer-box-office-collections-fraud-and-unbelievably-naive-lies (secondary)
- S31 https://malaymail.com/news/showbiz/2025/11/19/is-bollywood-faking-it-insiders-say-paid-reviews-and-bought-out-shows-are-warping-the-industry/198910 (AFP, secondary)
- S32 https://telugucinema.com/news/dil-raju-admits-collection-posters-are-mostly-inflated-or-fake (secondary)
- Project files read: README.md ("About the numbers"), js/boxoffice.js, js/data.js
