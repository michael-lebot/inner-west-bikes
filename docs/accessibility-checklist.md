# Accessibility checklist

The manual checks from `SPEC.md` §10.6, §12 and §13, run at every milestone. axe and the contrast test run in CI on
every page and state, but they cover only part of WCAG, so this pass is a release gate too: any A or AA failure it
finds blocks the release until it is fixed (§10.6).

Tick a box when the check passes at that milestone, and note what was used (device, browser, screen reader version).
"Phones" means a small iPhone (SE size), a current iPhone and a mid-range Android.

## Assistive technology and input (§10.6)

| Check                                                                                                                                                      | M1  | M2  | M3  | M4  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --- | --- | --- |
| VoiceOver on iOS Safari: every pin can be reached; tag a bike from start to finish with Choose by street, and again with Use my location                   | [ ] | [ ] | [ ] | [ ] |
| TalkBack on Android Chrome: the same                                                                                                                       | [ ] | [ ] | [ ] | [ ] |
| Keyboard only on desktop, in Chrome, Safari and Firefox (§13): every flow, the report form and the admin app included, with the focus always visible       | [ ] | [ ] | [ ] | [ ] |
| Touch without dragging: reach a spot that starts off screen and tag it with taps alone; shrink and restore a tag card by tap, and by a flick on its handle | [ ] | [ ] | [ ] | [ ] |
| 200% browser zoom, and a 320 px wide window: nothing scrolls sideways, and each form's submit and Cancel can be reached                                    | [ ] | [ ] | [ ] | [ ] |
| The largest system text size on an SE-sized phone: each form's submit and Cancel can be reached                                                            | [ ] | [ ] | [ ] | [ ] |
| Label and pin contrast, judged on the real map on a phone, not only in the token test                                                                      | [ ] | [ ] | [ ] | [ ] |

## Phones (§12)

| Check                                                                                                                   | M1  | M2  | M3  | M4  |
| ----------------------------------------------------------------------------------------------------------------------- | --- | --- | --- | --- |
| The largest system text size on each phone                                                                              | [ ] | [ ] | [ ] | [ ] |
| Landscape on each phone, which uses the side panel                                                                      | [ ] | [ ] | [ ] | [ ] |
| The browser's toolbar both expanded and collapsed, on each phone                                                        | [ ] | [ ] | [ ] | [ ] |
| The street search and house number with the on-screen keyboard open: the results stay in view                           |     | [ ] | [ ] | [ ] |
| A real photo from the camera and one from the library, on iOS and Android; on current iOS, a HEIC photo arrives as JPEG |     |     | [ ] | [ ] |
| Use my location outdoors, allowed and refused, on iOS and Android                                                       |     | [ ] | [ ] | [ ] |
| The map on Safari 16.4, the oldest supported                                                                            | [ ] | [ ] | [ ] | [ ] |
