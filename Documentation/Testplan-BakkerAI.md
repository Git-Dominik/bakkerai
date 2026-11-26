# Testplan en testrapport BakkerAI

Auteur: kietelmuis. Achteraf opgesteld op basis van de user stories (issues) en de code.

## 1. Wat wordt er getest

Login, registratie, e-mailverificatie, wachtwoord-reset, AI-chat met SVH-tools, chatgeschiedenis, admin en de [Definition of Done](DoD.md).

## 2. Testaanpak

- Per onderdeel het hoofdscenario, foutgevallen en randgevallen.
- De repository heeft geen test-suite (package.json heeft geen test-script).
- Uitgevoerd op 26-11-2026 tegen een lokale kopie van commit 7b7afb0 met een geautomatiseerd testscript (headless Chromium en HTTP-verzoeken, opgesteld met AI-hulp). Er waren geen sleutels voor Groq en Resend. Waar 'nagebootst AI-antwoord' staat, is alleen de werking van de app in de browser getest, niet de AI.

## 3. Testdata

Testaccounts student.a, student.c, student.d en student.e@student.talland.nl en admin.test@student.talland.nl (als ADMIN_EMAIL); een wachtwoord van 7 tekens (abc1234) en een geldig wachtwoord; een extern adres (test@gmail.com); een gebruikersnaam van 1 teken; een geldige en een verlopen resetlink; een vraag over een recept (abrikozenbolletjes). Getest met een lege lokale database.

## 4. Testscenario's en resultaten

### A. Registratie (#7)

| Nr | Scenario | Gewenst resultaat | Bron (issue / code) | Resultaat | Opmerking / verbeteren | Bewijs |
|---|---|---|---|---|---|---|
| BA-01 | Registreren met een @student.talland.nl-adres, een gebruikersnaam van 2+ tekens en een wachtwoord van 8+ tekens | Account wordt aangemaakt, de verificatiecode wordt gemaild en je komt op de verificatiepagina | auth.ts /register | OK | Mail niet echt verstuurd (geen Resend-sleutel); code uit het serverlog gebruikt. | [screenshot](testbewijs/ba01-verificatiepagina.png) |
| BA-02 | Registreren met een ander e-mailadres (bijv. test@gmail.com) | Foutmelding "Gebruik je @student.talland.nl e-mailadres." | auth.ts validateEmail | OK |  | [screenshot](testbewijs/ba02-verkeerd-emaildomein.png) |
| BA-03 | Registreren met een wachtwoord van 7 tekens | Foutmelding "Gebruik een wachtwoord van 8 tot 128 tekens." | auth.ts /register | OK | De browser blokkeert het formulier al; de server weigert dezelfde invoer ook. |  |
| BA-04 | Registreren met een gebruikersnaam van 1 teken | Foutmelding "Gebruik een gebruikersnaam van 2 tot 60 tekens." | auth.ts /register | OK | De browser blokkeert het formulier al; de server weigert dezelfde invoer ook. |  |
| BA-05 | Registreren met een e-mailadres dat al geverifieerd is | Foutmelding "Er bestaat al een account met dit e-mailadres." | auth.ts /register | OK |  |  |

### B. E-mailverificatie (commit 94f7609, Dominik)

| Nr | Scenario | Gewenst resultaat | Bron (issue / code) | Resultaat | Opmerking / verbeteren | Bewijs |
|---|---|---|---|---|---|---|
| BA-06 | Juiste 6-cijferige code invullen | Account is geverifieerd en je bent ingelogd | auth.ts /verify | OK |  |  |
| BA-07 | Vijf keer een foute code invullen | Na de vijfde poging is de code ongeldig; je moet een nieuwe code aanvragen | VERIFICATION_MAX_ATTEMPTS = 5 | OK |  |  |
| BA-08 | Code invullen na meer dan 10 minuten | Foutmelding "De code is verlopen. Vraag een nieuwe code aan." | VERIFICATION_CODE_TTL_MS = 10 min | OK | Verlooptijd in de database teruggezet in plaats van 10 minuten gewacht. |  |
| BA-09 | Nieuwe code aanvragen binnen 60 seconden na de vorige | Melding met wachttijd; er wordt geen nieuwe mail verstuurd | VERIFICATION_RESEND_COOLDOWN_MS = 60 s | OK |  |  |

### C. Inloggen en sessie (#6, #8)

| Nr | Scenario | Gewenst resultaat | Bron (issue / code) | Resultaat | Opmerking / verbeteren | Bewijs |
|---|---|---|---|---|---|---|
| BA-10 | Inloggen met een geverifieerd account en het juiste wachtwoord | Je komt op de chatpagina; de cookie is HttpOnly (niet uitleesbaar via JavaScript) | auth.ts setSession | OK |  | [screenshot](testbewijs/ba10-chat-na-inloggen.png) |
| BA-11 | Inloggen met een fout wachtwoord | Foutmelding "E-mailadres of wachtwoord is onjuist." | auth.ts /login | OK |  | [screenshot](testbewijs/ba11-fout-wachtwoord.png) |
| BA-12 | Inloggen met een account dat nog niet geverifieerd is | Melding "Verifieer eerst je e-mailadres met de code uit je e-mail." | auth.ts /login | OK |  |  |
| BA-13 | Browser sluiten en later opnieuw openen | Je blijft ingelogd (cookie geldig 7 dagen) | AUTH_COOKIE_MAX_AGE = 7 dagen | OK | Nagebootst met een nieuwe browsersessie met dezelfde cookie; geldigheid van 7 dagen gecontroleerd. |  |
| BA-14 | Uitloggen en daarna de chatpagina openen | Je bent uitgelogd en krijgt geen toegang tot de chat | script.js logout, auth.ts /logout | OK |  |  |

### D. Wachtwoord vergeten (commit 94f7609, Dominik)

| Nr | Scenario | Gewenst resultaat | Bron (issue / code) | Resultaat | Opmerking / verbeteren | Bewijs |
|---|---|---|---|---|---|---|
| BA-15 | Reset aanvragen met een bekend adres en met een onbekend adres | Bij beide dezelfde melding "Als dit e-mailadres bij ons bekend is…"; alleen het bekende adres krijgt een mail | auth.ts /forgot-password | OK | Resetlink uit het serverlog (geen echte mail). | [screenshot](testbewijs/ba15-reset-aanvragen.png) |
| BA-16 | Resetlink openen en binnen 30 minuten een nieuw wachtwoord instellen | Wachtwoord is gewijzigd en inloggen met het nieuwe wachtwoord lukt | PASSWORD_RESET_TTL_MS = 30 min | OK | De link is maar een keer te gebruiken. |  |
| BA-17 | Resetlink gebruiken na 30 minuten | Foutmelding "Deze resetlink is ongeldig of verlopen. Vraag een nieuwe resetlink aan." | auth.ts /reset-password | OK | Verlooptijd in de database teruggezet in plaats van 30 minuten gewacht. |  |

### E. Chat (#4, #5, #9, #10, #11, #12, #13, #14, #15, #17)

| Nr | Scenario | Gewenst resultaat | Bron (issue / code) | Resultaat | Opmerking / verbeteren | Bewijs |
|---|---|---|---|---|---|---|
| BA-18 | Nieuwe chat starten en een vraag over een recept stellen | Het antwoord verschijnt letter voor letter, in het Nederlands | script.js (typewriter), systeemprompt (#13) | Niet uitvoerbaar | Geen Groq-sleutel (variabele lekey). Verbeteren: de app toont geen foutmelding als de AI niet werkt. |  |
| BA-19 | Tweede bericht sturen terwijl het antwoord nog bezig is | Melding "hollon im cookin"; het tweede bericht wordt niet verstuurd | script.js busy-check (#10) | OK | Getest met een nagebootst AI-antwoord. Verbeteren: de getypte tweede vraag wordt gewist. | [screenshot](testbewijs/ba19-dubbel-bericht.png) |
| BA-20 | Leeg bericht sturen | Bericht wordt niet verstuurd; er komt geen lege AI-reactie | script.js sendMessage (commit 22bfbd4) | OK | In de app wordt niets verstuurd. Verbeteren: bij een direct verzoek slaat de server een bericht met alleen spaties wel op. |  |
| BA-21 | Vraag over recepten of lesstof stellen | In de chat is zichtbaar welke SVH-tool de AI gebruikt; het antwoord komt uit de SVH-data | chats.ts, api/svh.ts tools (#14, #15) | Niet uitvoerbaar | Geen Groq-sleutel, dus AI-toolgebruik en SVH-data niet getest. |  |
| BA-22 | Een eerdere chat openen vanuit de chatlijst, na het herladen van de pagina | De berichten staan er nog en de chat heeft een onderwerp | chats.ts topic (#5, #12) | OK | De titel is de eerste vraag; de AI-titel is niet getest (geen Groq-sleutel). | [screenshot](testbewijs/ba22-chatgeschiedenis.png) |
| BA-23 | Een chat van een andere student openen (/chats/:id met een ander id) | "Chat not found" (404); geen berichten zichtbaar | chats.ts userId-check | OK | Lezen en schrijven geven 404. |  |
| BA-24 | Een lang antwoord laten streamen | De pagina scrolt automatisch mee met het antwoord | script.js autoscroll (#4) | OK | Getest met een nagebootst AI-antwoord; ook het letter-voor-letter verschijnen gezien. | [screenshot](testbewijs/ba24-autoscroll.png) |
| BA-25 | Promptsuggesties gebruiken op een lege chat | Suggesties zijn zichtbaar; klikken zet de tekst in het invoerveld | script.js (#17) | OK |  | [screenshot](testbewijs/ba25-suggesties.png) |

### F. Admin (#16, #19)

| Nr | Scenario | Gewenst resultaat | Bron (issue / code) | Resultaat | Opmerking / verbeteren | Bewijs |
|---|---|---|---|---|---|---|
| BA-26 | Admin-route /admin/users aanroepen als gewone student | 403 Forbidden, "Admin access required" | admin.ts adminGuard | OK | Niet ingelogd geeft 401. |  |
| BA-27 | Inloggen als beheerder en de gebruikerslijst openen | De lijst met gebruikers wordt getoond; de chats van een gebruiker zijn in te zien | admin.ts /admin/users | OK | Werkt met ADMIN_EMAIL op een studentadres. Verbeteren: het standaardadres admin@bakkerai.nl kan niet registreren. | [screenshot](testbewijs/ba27-admin.png) |

### G. Algemeen (DoD)

| Nr | Scenario | Gewenst resultaat | Bron (issue / code) | Resultaat | Opmerking / verbeteren | Bewijs |
|---|---|---|---|---|---|---|
| BA-28 | Navbar en footer gebruiken op alle pagina's | Alle links werken; geen kapotte pagina's | public/*.html (#20, #21) | NOK | Geen enkele van de 7 pagina's heeft een footer; alleen chat en admin hebben navigatie. Het logo op login en registratie linkt naar #. Footer verwijderd in commit 32b7d93. |  |
| BA-29 | De site openen op telefoonbreedte (375 px) | De layout past zich aan; geen horizontaal scrollen | DoD punt 12 | NOK | /admin is 391 px breed en scrolt horizontaal. De andere 6 pagina's passen. | [screenshot](testbewijs/ba29-admin-mobiel.png) |
| BA-30 | Het project starten volgens de README (bun install, bun run migrate, bun run dev) | De server draait op http://localhost:3000 | README.md | OK | De README noemt de omgevingsvariabelen niet (lekey, RESEND_API_KEY, EMAIL_FROM, JWT_SECRET). |  |
| BA-31 | De startpagina (/) openen zonder ingelogd te zijn | Een homepage legt uit wat BakkerAI is | #18 | NOK | / toont de loginpagina. De homepage (public/index.html) is verwijderd in commit 32b7d93. | [screenshot](testbewijs/ba31-startpagina.png) |

## 5. Testrapport

Conclusie: 31 scenario's, waarvan 26 OK, 3 NOK (BA-28, BA-29, BA-31) en 2 niet uitvoerbaar (BA-18, BA-21). Registratie, verificatie, inloggen, wachtwoord-reset, chatgeschiedenis en afscherming werken zoals verwacht. De AI-antwoorden en de SVH-tools zijn niet getest, dus over de kernfunctie geeft dit rapport nog geen oordeel. Aan de DoD is nog niet voldaan: de homepage ontbreekt, de adminpagina past niet op mobiel en berichten met alleen spaties worden alleen in de app tegengehouden.

### Verbeterpunten

- Homepage en footer terugzetten of de issues #18 en #21 en deze DoD aanpassen (BA-28, BA-31).
- De adminpagina passend maken op 375 px (BA-29).
- Een foutmelding tonen als de AI niet antwoordt (BA-18).
- Lege berichten (alleen spaties) ook op de server weigeren (BA-20).
- De getypte tekst bewaren als er nog een antwoord bezig is (BA-19).
- In de README de omgevingsvariabelen beschrijven en het standaard admin-adres bruikbaar maken (BA-27, BA-30).
