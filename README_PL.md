# Asfalt 07 — Drift Basin

Projekt istniejącej mobilnej gry 3D w przeglądarce. Ten pakiet zawiera źródła gry, konfigurację aut, serwer WebSocket dla pokoi dwóch graczy oraz konfigurację Cloudflare Workers. Nie wymaga Roblox Studio, komputera ani płatnego hostingu. Zawiera kod do wdrożenia, ale **nie jest jeszcze opublikowany na Twoim koncie**: stały publiczny adres powstanie dopiero po połączeniu GitHub z Cloudflare i udanym wdrożeniu.

## Pierwsze wdrożenie — wyłącznie telefonem

Potrzebne są bezpłatne konta GitHub i Cloudflare oraz przeglądarka Androida. Nie wpisuj karty płatniczej i nie przełączaj konta Cloudflare na plan Workers Paid. Zawartość repozytorium nie ma kluczy ani haseł.

1. Pobierz `asfalt07-telefon.zip` na telefon i rozpakuj go w aplikacji Pliki. Wszystkie pliki projektu są w jednym folderze, bez `node_modules`.
2. W GitHubie utwórz nowe repozytorium (może być prywatne). Wybierz **Add file → Upload files** i z rozpakowanego folderu zaznacz wszystkie pliki: `index.html`, `cars.json`, `worker.template.js`, `build_package.mjs`, `wrangler.jsonc`, `package.json`, `package-lock.json`, `worker.js` i `README_PL.md`. Zatwierdź pierwszy commit.
3. W Cloudflare otwórz **Workers & Pages → Create application → Import a repository**. Połącz GitHub przez oficjalną aplikację Cloudflare. Gdy GitHub zapyta o dostęp do repozytoriów, wybierz **Only select repositories** i zaznacz wyłącznie repozytorium tej gry — nie wybieraj wszystkich repozytoriów.
4. Ustaw Root directory na katalog główny repozytorium. Wpisz Build command `npm ci && npm run build`; Deploy command `npm run deploy`. Ustaw nazwę Workera `asfalt07` zgodnie z `wrangler.jsonc`. Cloudflare buduje i publikuje kod w swojej chmurze.
5. Jeśli Cloudflare pyta o plan lub płatność, przerwij i nie dodawaj karty. Zostań w planie Free. Po udanym deploy otwórz adres Workera z panelu — zwykle `https://asfalt07.<twoja-nazwa>.workers.dev`. Dopisz `/health`; oczekiwany wynik to JSON zawierający `"ok":true`.
6. Otwórz główny adres na swoim Moto G15 i sprawdź lokalną jazdę. Wybierz **Pokój → Utwórz pokój → Udostępnij link**; kolega otwiera ten link na swoim telefonie i naciska **Dołącz**. Kod można także przepisać ręcznie.

**Ważne o zgodzie GitHub:** integracja GitHub widoczna w Manus nie jest potrzebna do tego procesu. Jeśli jej zgoda pokazuje tylko e-mail i Gist, anuluj ją — te uprawnienia nie pozwalają zbudować repozytorium ani aktualizować plików gry. Połączenie odbywa się w panelu Cloudflare i powinno dotyczyć wyłącznie wybranego repozytorium.

Ten sam Worker obsługuje stronę gry i multiplayer WebSocket, więc nie trzeba osobnego hostingu frontendowego ani komputera-serwera. Free plan ma limity; po ich osiągnięciu usługa może czasowo odmówić dalszych operacji. Darmowe limity ani nieprzerwana dostępność nie są gwarantowane przez Manus.

## Jak aktualizować pod tym samym linkiem

Nie twórz nowego repozytorium ani Workera. Zachowaj to samo repozytorium GitHub, tę samą konfigurację Builds i tę samą nazwę `asfalt07`. Po zmianie plików i nowym commicie Workers Builds ponownie uruchomi build i deploy do tego samego Workera; jego URL pozostaje ten sam.

Najprościej: poproś Manus o zmianę istniejącego projektu Asfalt 07, pobierz zaktualizowany pakiet i w GitHubie (w przeglądarce telefonu) zastąp zmienione pliki w tym samym repozytorium przez **Add file → Upload files**; przy konflikcie wybierz zastąpienie, potem utwórz commit. Nie edytuj ręcznie wygenerowanego `worker.js`, bo build tworzy go ponownie ze źródeł. Zachowaj oryginalny ZIP w Plikach jako kopię źródeł. Jeśli rozpoczniesz nową rozmowę/kopię projektu, załącz ten ZIP, żeby kontynuować istniejącą bazę zamiast generować ją od zera.

## Konfiguracja samochodów

Edytowalnym źródłem parametrów jest `cars.json` — jeden rekord na samochód. Możesz zmieniać `id`, nazwę, klasę (`type`), istniejący kształt (`shape`), moc (`power`), przyczepność (`grip`), masę (`weight`), limit prędkości (`max`) i kolor (`color`). `build_package.mjs` waliduje plik i automatycznie umieszcza te same osiągi po stronie klienta i multiplayera. Dla nowego wariantu o istniejącej sylwetce skopiuj rekord, nadaj unikalne `id` i zmień parametry. Nowy typ nadwozia wymaga także zmiany mapy `profiles` w `index.html`. Zmiany mapy/toru/sterowania są w `index.html`; logika sieci i fizyka serwera są w `worker.template.js`. Po każdej zmianie uruchom build (albo poproś o to Manus) i opublikuj nowe źródła w tym samym repo.

## Sterowanie i zawartość

Ekran ma przyciski dotykowe: lewo/prawo, ręczny hamulec, biegi R oraz 1–6, hamulec i gaz. Dodatni input skrętu oznacza lewo, a klient i serwer stosują tę samą konwencję; przed wdrożeniem sprawdź zachowanie na swoim telefonie. Garaż zawiera 8 profili i 6 kolorów. Są tuning mocy, przełożenia i przyczepności, otwarta lekka mapa z pętlą, placem driftu i parkingiem, wskaźnik prędkości/obrotów oraz syntetyzowany dźwięk silnika.

## Ograniczenia — bez udawania pełnej symulacji

To lekka gra przeglądarkowa, nie symulator klasy Assetto Corsa ani BeamNG.drive. Fizyka jazdy jest uproszczona; modele są proceduralne low-poly z dodatkowymi detalami, a nie skanami/licencjonowanymi modelami. Uszkodzenia są wizualne, bez miękkiej deformacji blach. Pokoje obsługują maksymalnie dwóch kierowców i są tymczasowe. Klient pobiera Three.js i zaokrągloną geometrię z publicznego jsDelivr, więc telefon potrzebuje internetu.

Test lokalny potwierdza składnię i budowanie klienta/Workera; test lokalnego WebSocket nie jest testem produkcyjnego internetu. **Nie twierdzimy, że publiczny multiplayer jest gotowy, dopóki Worker nie zostanie wdrożony i dwie przeglądarki nie połączą się przez publiczny URL.** Po publikacji sprawdź oba telefony, wejście do tego samego pokoju i ruch obu aut.

## Oficjalne źródła usług

- [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Build commands](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Durable Objects pricing and free tier](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
