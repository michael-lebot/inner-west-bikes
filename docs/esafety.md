# eSafety

The response procedure and, before launch, the classification (`SPEC.md` §7). This is not legal advice.

## Response procedure

**Who receives notices.** Notices and complaints come to the contact address on `/privacy` and `/accessibility`,
which is forwarded to Michael's phone. An eSafety removal notice must be met within 24 hours.

**How to remove something urgently,** in the admin app (`SPEC.md` §4.6):

- **A reported photo:** Reported photos, then Delete. It and its files go for good.
- **A tag, or a photo nobody has reported:** Tags, look the tag up by its address (`/tag/<id>`) or its ID, then Take
  down. The tag leaves the map for good and its photo is deleted with it.
- **Given only a photo's address** (`/photo/<id>`): find its tag in Neon's SQL editor with
  `SELECT tag_id FROM photos WHERE id = '<id>'`, then take the tag down as above.
- **Many photos at once:** Pause uploads, on either screen, then deal with each one. Tags without photos can still be
  added.

Anyone can report a photo from its card or its page. The first report hides it at once, until Michael restores or
deletes it. After a restore, later reports on that photo are recorded and queued, and reach Michael, but no longer hide
it: a photo restored by mistake needs Delete or Take down. If more than 15 photos are reported in an hour, uploads
pause by themselves and Michael is emailed.

**While Michael is away.** He pauses photo uploads before leaving, and resumes them when he is back: they stay off
until he does. Reported photos stay hidden until he reviews them, and every photo is deleted when its tag's 48
hours run out.

## Classification

To be done by Michael before launch: which online-safety codes or standards apply to an anonymous site that publishes
visitors' photos, covering both the unlawful-material rules and the age-restricted-material rules, using eSafety's
guidance as it stands at the time (<https://www.esafety.gov.au/industry/codes>). Write down the category and risk
tier that result, with the reasons. The lowest tier is the expected answer, not an assumed one: if the assessment
lands anywhere else, the extra obligations become launch blockers.
