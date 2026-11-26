# Definition of Done: BakkerAI

BakkerAI is pas af als de volgende onderdelen minimaal werken:

- Een student kan een account aanmaken met een @student.talland.nl-adres, het account verifiëren met de 6-cijferige code, inloggen en uitloggen.
- Een student blijft ingelogd tussen bezoeken (cookie van 7 dagen) en kan het wachtwoord resetten via de e-mail.
- Een student kan een nieuwe chat starten, een vraag stellen en het antwoord letter voor letter zien verschijnen.
- Tijdens het genereren van een antwoord kan er geen tweede bericht worden verstuurd, en lege berichten worden niet verstuurd.
- De AI gebruikt de SVH-tools voor recepten en lesstof, en het gebruik van een tool is zichtbaar in de chat.
- Eerdere chats staan in de chatgeschiedenis en kunnen worden hervat; een chat van een andere student is niet zichtbaar.
- De homepage legt uit wat BakkerAI is, en de chatpagina toont promptsuggesties.
- Een beheerder kan gebruikers en chats bekijken; een gewone student krijgt een 403-melding op de admin-routes.
- Alle invoer is gevalideerd: e-mailadres, gebruikersnaam (2 t/m 60 tekens), wachtwoord (8 t/m 128 tekens) en de invoer van de AI-tools (Zod).
- Wachtwoorden worden met argon2 gehasht; verificatie- en resettokens staan alleen als hash in de database, met een verlooptijd.
- De app start met de stappen uit de README (bun install, bun run migrate, bun run dev) en is bereikbaar op http://localhost:3000.
- De navigatie en de pagina's zijn bruikbaar op desktop en op mobiel (smalle schermen zonder horizontaal scrollen).
