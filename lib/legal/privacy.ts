// The privacy policy shown at /privacy and summarised on the consent screen. Its version is what people agree to:
// change the text materially → bump PRIVACY_VERSION, and everyone is asked again at their next visit.
import type { Locale } from "../time";
import type { LegalDoc } from "./doc";

export const PRIVACY_VERSION = "2026-11-25";
/** Date of this edition, for the page header. */
export const PRIVACY_UPDATED = new Date("2026-11-25T00:00:00+05:00");

/** How long each kind of data is kept (days). lib/privacy.ts runRetention() enforces it every night. */
export const RETENTION_DAYS = {
  /** login_attempts: lockouts need 15 minutes, the profile shows the last few sign-ins. */
  signIns: 90,
  /** Expired one-time sign-in links and Telegram link tokens. */
  tokens: 1,
  /** Medical certificate files after the decision (the decision itself stays in the journal). */
  certificates: 30,
  rejectedApplications: 30,
  applicationIps: 30,
  readNotifications: 180,
  /** Usage events keep the account id this long, then lose it. */
  identifiedEvents: 365,
  /** After consent is withdrawn: within 15 working days (Law No. 94-V, art. 8(7)). */
  afterWithdrawal: 14,
} as const;

type R = typeof RETENTION_DAYS;

const ru = (r: R): LegalDoc => ({
  title: "Политика конфиденциальности",
  lead:
    "UniOS — студенческий проект Narxoz University: расписание, дедлайны, оценки, посещаемость и объявления в одном месте, с напоминаниями в Telegram. " +
    "Здесь написано, какие ваши данные мы обрабатываем, зачем, где и сколько храним и как вы можете ими управлять. Мы следуем Закону РК № 94-V " +
    "«О персональных данных и их защите» (с изменениями 2026 года), Цифровому кодексу РК и принципам GDPR.",
  sections: [
    {
      id: "operator",
      title: "Кто обрабатывает данные",
      blocks: [
        "Оператор — команда студенческого проекта UniOS (Narxoz University, Алматы). Пока проект не зарегистрирован как юридическое лицо, за обработку данных отвечает руководитель проекта; в команде назначен ответственный за организацию обработки персональных данных.",
        "Когда университет подключает UniOS по договору, владельцем учебных данных остаётся университет, а UniOS обрабатывает их по его поручению.",
      ],
    },
    {
      id: "data",
      title: "Какие данные мы обрабатываем",
      blocks: [
        {
          list: [
            "Аккаунт: имя и фамилия, почта, роль (студент, преподаватель, эдвайзер), язык интерфейса. Пароль хранится только в виде хэша bcrypt — сам пароль не знает никто.",
            "Учёба студента: группа, курсы и расписание, дедлайны и отметки о выполнении, загруженные работы, оценки и комментарии преподавателя, посещаемость (в том числе отметки по QR-коду), заявления об уважительной причине и медицинские справки.",
            "Работа преподавателя: курсы, расписание, объявления, выставленные оценки и посещаемость. При самостоятельной регистрации — заявка: предметы, расписание, комментарий и IP-адрес.",
            "Связь: Telegram chat ID, если вы подключили бота; настройки напоминаний; уведомления в приложении; адрес ленты календаря Canvas, если вы его добавили.",
            "Безопасность: история входов — время, IP-адрес и браузер. Она нужна, чтобы блокировать подбор пароля и показывать вам последние входы.",
            "Использование сервиса: события вроде «открыл дедлайн из напоминания». По ним мы понимаем, помогают ли напоминания.",
          ],
        },
        "Медицинские справки — данные о здоровье, то есть данные ограниченного доступа. Их видят только вы, преподаватель этого занятия и эдвайзер вашей группы.",
        "Мы не собираем платёжные данные, биометрию и геолокацию. Cookie только необходимые: uni_session (вход, 30 дней) и locale (язык). Рекламы и сторонних трекеров нет, шрифты загружаются с нашего сервера.",
      ],
    },
    {
      id: "purposes",
      title: "Зачем и на каком основании",
      blocks: [
        {
          list: [
            "Показывать ваше расписание, дедлайны, оценки, посещаемость и объявления и напоминать о сроках.",
            "Защищать аккаунт: блокировка после неверных паролей, выход со всех устройств, журнал входов.",
            "Улучшать продукт по обезличенной и сводной статистике.",
          ],
        },
        "Основание — ваше согласие (ст. 7–8 Закона № 94-V). Вы даёте его при первом входе или в заявке преподавателя. Согласие действует, пока у вас есть аккаунт; отозвать его можно в любой момент.",
        "Мы не продаём данные, не показываем рекламу и не обучаем на них ИИ.",
      ],
    },
    {
      id: "decisions",
      title: "Решения принимают люди",
      blocks: [
        "UniOS не принимает автоматических решений, которые меняют ваши права (ст. 19-1 Закона № 94-V, ст. 43 Цифрового кодекса). Оценки, пропуски, справки и заявки преподавателей решают люди — преподаватель или эдвайзер.",
        "QR-отметка ставит только «присутствовал» или «опоздал», и преподаватель может её исправить. Счётчик пропусков и режим «что если» для GPA — подсказки с открытой формулой, а не решения.",
        "Если вы не согласны с результатом, напишите преподавателю или эдвайзеру. На возражение против автоматической обработки мы отвечаем в течение 3 рабочих дней.",
      ],
    },
    {
      id: "recipients",
      title: "Кто видит данные",
      blocks: [
        {
          list: [
            "Вы сами.",
            "Преподаватели — студентов своих курсов: оценки, посещаемость, работы и справки по своим занятиям.",
            "Эдвайзер — студентов своих групп и заявки преподавателей.",
            "Команда UniOS — только чтобы исправлять ошибки и отвечать на ваши запросы.",
          ],
        },
        "Обработчики, которым мы передаём данные для работы сервиса:",
        {
          list: [
            "Supabase Inc. — база данных PostgreSQL на серверах AWS (регион ap-south-1, Мумбаи, Индия).",
            "Vercel Inc. — хостинг сайта (функции в регионе bom1, Мумбаи).",
            "Telegram — доставка напоминаний и ответов бота, если вы его подключили.",
            "Resend — письма со ссылкой для входа, если эта функция включена.",
          ],
        },
        "Если вы добавили ленту Canvas, UniOS читает её с серверов Instructure по вашей ссылке.",
      ],
    },
    {
      id: "storage",
      title: "Где хранятся данные",
      blocks: [
        "Сейчас база и сервер находятся в Индии. Это трансграничная передача (ст. 16 Закона № 94-V), и мы проводим её на основании вашего согласия.",
        "Закон требует хранить персональные данные в базе на территории Казахстана (ст. 12, п. 2), а данные ограниченного доступа, например справки, — в дата-центре в Казахстане. Поэтому сейчас UniOS работает как учебный MVP с демо-аккаунтами. До пилота с реальными данными студентов мы перенесём базу и сервер в казахстанский дата-центр.",
        "До переноса не загружайте настоящие медицинские справки — используйте тестовые файлы.",
      ],
    },
    {
      id: "retention",
      title: "Сколько мы храним",
      blocks: [
        {
          table: [
            ["Аккаунт и учебные записи", "Пока действует аккаунт. После его удаления — до 30 дней, кроме записей, которые университет обязан хранить по закону"],
            ["Файл медицинской справки", `${r.certificates} дней после решения; само решение остаётся в журнале`],
            ["История входов", `${r.signIns} дней`],
            ["Прочитанные уведомления", `${r.readNotifications} дней`],
            ["События использования", `${r.identifiedEvents} дней с привязкой к аккаунту, потом обезличиваются`],
            ["Отклонённые заявки преподавателей", `${r.rejectedApplications} дней после решения; IP-адрес в любой заявке — ${r.applicationIps} дней`],
            ["Ссылки для входа и привязки Telegram", "сутки после истечения"],
          ],
        },
        "Удаление выполняется автоматически каждую ночь.",
      ],
    },
    {
      id: "security",
      title: "Как мы защищаем данные",
      blocks: [
        {
          list: [
            "HTTPS на всём пути и HSTS; база шифруется на диске у провайдера.",
            "Пароли — bcrypt; сессия — подписанный httpOnly-cookie; можно выйти со всех устройств.",
            "После 5 неверных паролей вход блокируется на 15 минут.",
            "Row Level Security: каждый запрос от имени пользователя видит только разрешённые ему строки, а хэши паролей и токены недоступны даже таким запросам.",
            "Файлы справок и работ отдаются только после проверки доступа и открываются в изолированном режиме браузера.",
          ],
        },
        "Если произойдёт утечка, мы уведомим уполномоченный орган и вас не позже одного рабочего дня.",
      ],
    },
    {
      id: "rights",
      title: "Ваши права",
      blocks: [
        {
          list: [
            "Получить копию своих данных: Профиль → «Мои данные» → «Скачать мои данные» (файл JSON).",
            "Исправить данные: язык и настройки — в профиле, оценки и посещаемость — через преподавателя, остальное — через эдвайзера.",
            `Отозвать согласие: Профиль → «Мои данные». Мы сразу прекращаем рассылки, отключаем Telegram, календарь и Canvas и выходим со всех устройств. В течение ${r.afterWithdrawal} дней (не позже 15 рабочих дней, ст. 8 п. 7) удаляем уведомления, напоминания и историю входов и обезличиваем статистику. Учебные записи остаются у университета.`,
            "Потребовать заблокировать или удалить данные, обработанные с нарушением закона.",
            "Пожаловаться в уполномоченный орган — Министерство искусственного интеллекта и цифрового развития РК.",
          ],
        },
      ],
    },
    {
      id: "ai",
      title: "Искусственный интеллект",
      blocks: [
        "Сейчас UniOS не использует ИИ для обработки ваших данных. Если появится ИИ-помощник, мы заранее обновим эту политику, будем помечать ответы ИИ (Закон РК «Об искусственном интеллекте») и спросим отдельное согласие.",
      ],
    },
    {
      id: "changes",
      title: "Изменения политики",
      blocks: ["У политики есть версия и дата. Если мы существенно её изменим, при следующем входе попросим согласие заново."],
    },
    {
      id: "contact",
      title: "Как с нами связаться",
      blocks: ["Запросы по вашим данным принимают эдвайзер вашей группы и команда UniOS."],
    },
  ],
});

const kk = (r: R): LegalDoc => ({
  title: "Құпиялылық саясаты",
  lead:
    "UniOS — Narxoz University студенттерінің жобасы: кесте, дедлайндар, бағалар, сабаққа қатысу және хабарландырулар бір жерде, Telegram-да еске салғыштармен. " +
    "Мұнда біз сіздің қандай деректеріңізді, не үшін өңдейтінімізді, қайда және қанша уақыт сақтайтынымызды және оларды қалай басқара алатыныңызды жаздық. " +
    "Біз ҚР «Дербес деректер және оларды қорғау туралы» № 94-V Заңын (2026 жылғы өзгерістерімен), ҚР Цифрлық кодексін және GDPR қағидаттарын ұстанамыз.",
  sections: [
    {
      id: "operator",
      title: "Деректерді кім өңдейді",
      blocks: [
        "Оператор — UniOS студенттік жобасының командасы (Narxoz University, Алматы). Жоба заңды тұлға ретінде тіркелгенге дейін деректерді өңдеуге жоба жетекшісі жауап береді; командада дербес деректерді өңдеуді ұйымдастыруға жауапты адам тағайындалған.",
        "Университет UniOS-ты шарт бойынша қосқанда, оқу деректерінің иесі университет болып қалады, ал UniOS оларды университеттің тапсырмасы бойынша өңдейді.",
      ],
    },
    {
      id: "data",
      title: "Қандай деректерді өңдейміз",
      blocks: [
        {
          list: [
            "Аккаунт: аты-жөні, пошта, рөлі (студент, оқытушы, эдвайзер), интерфейс тілі. Құпиясөз тек bcrypt хэші түрінде сақталады — құпиясөздің өзін ешкім білмейді.",
            "Студенттің оқуы: тобы, курстары мен кестесі, дедлайндар және олардың орындалуы, жүктелген жұмыстар, бағалар мен оқытушының пікірлері, сабаққа қатысу (QR-код арқылы белгілер де), дәлелді себеп туралы өтініштер мен медициналық анықтамалар.",
            "Оқытушының жұмысы: курстар, кесте, хабарландырулар, қойылған бағалар мен қатысу. Өз бетінше тіркелгенде — өтінім: пәндер, кесте, түсініктеме және IP-мекенжай.",
            "Байланыс: Telegram chat ID (ботты қоссаңыз), еске салғыш баптаулары, қосымшадағы хабарламалар, Canvas күнтізбесінің сілтемесі (қоссаңыз).",
            "Қауіпсіздік: кіру тарихы — уақыты, IP-мекенжайы және браузері. Ол құпиясөзді таңдап табуды бұғаттау және соңғы кірулерді көрсету үшін керек.",
            "Сервисті пайдалану: «еске салғыштан дедлайнды ашты» сияқты оқиғалар. Олар арқылы еске салғыштардың пайдасын бағалаймыз.",
          ],
        },
        "Медициналық анықтамалар — денсаулық туралы деректер, яғни қолжетімділігі шектеулі деректер. Оларды тек сіз, сол сабақтың оқытушысы және тобыңыздың эдвайзері көреді.",
        "Біз төлем деректерін, биометрияны және геолокацияны жинамаймыз. Cookie тек қажеттілері: uni_session (кіру, 30 күн) және locale (тіл). Жарнама мен бөгде трекерлер жоқ, қаріптер өз серверімізден жүктеледі.",
      ],
    },
    {
      id: "purposes",
      title: "Не үшін және қандай негізде",
      blocks: [
        {
          list: [
            "Кестеңізді, дедлайндарыңызды, бағаларыңызды, қатысуыңызды және хабарландыруларды көрсету және мерзімдерді еске салу.",
            "Аккаунтты қорғау: қате құпиясөздерден кейін бұғаттау, барлық құрылғылардан шығу, кірулер журналы.",
            "Өнімді иесіздендірілген және жиынтық статистика бойынша жақсарту.",
          ],
        },
        "Негіз — сіздің келісіміңіз (№ 94-V Заңның 7–8-баптары). Оны алғаш кіргенде немесе оқытушы өтінімінде бересіз. Келісім аккаунтыңыз бар кезде жарамды; оны кез келген уақытта кері қайтарып алуға болады.",
        "Біз деректерді сатпаймыз, жарнама көрсетпейміз және олармен ЖИ үйретпейміз.",
      ],
    },
    {
      id: "decisions",
      title: "Шешімдерді адамдар қабылдайды",
      blocks: [
        "UniOS сіздің құқықтарыңызды өзгертетін автоматты шешімдер қабылдамайды (№ 94-V Заңның 19-1-бабы, Цифрлық кодекстің 43-бабы). Бағаларды, жіберілген сабақтарды, анықтамаларды және оқытушылардың өтінімдерін адамдар — оқытушы немесе эдвайзер шешеді.",
        "QR-белгі тек «қатысты» немесе «кешікті» деп қояды, оқытушы оны түзете алады. Жіберілген сабақтар санағышы мен GPA-ның «егер» режимі — формуласы ашық кеңестер, шешім емес.",
        "Нәтижемен келіспесеңіз, оқытушыға немесе эдвайзерге жазыңыз. Автоматты өңдеуге қарсылыққа 3 жұмыс күні ішінде жауап береміз.",
      ],
    },
    {
      id: "recipients",
      title: "Деректерді кім көреді",
      blocks: [
        {
          list: [
            "Сіздің өзіңіз.",
            "Оқытушылар — өз курстарының студенттерін: өз сабақтары бойынша бағаларды, қатысуды, жұмыстар мен анықтамаларды.",
            "Эдвайзер — өз топтарының студенттерін және оқытушылардың өтінімдерін.",
            "UniOS командасы — тек қателерді түзету және сұрауларыңызға жауап беру үшін.",
          ],
        },
        "Сервистің жұмысы үшін деректерді беретін өңдеушілер:",
        {
          list: [
            "Supabase Inc. — AWS серверлеріндегі PostgreSQL дерекқоры (ap-south-1 өңірі, Мумбаи, Үндістан).",
            "Vercel Inc. — сайт хостингі (bom1 өңіріндегі функциялар, Мумбаи).",
            "Telegram — ботты қоссаңыз, еске салғыштар мен бот жауаптарын жеткізу.",
            "Resend — бұл мүмкіндік қосылса, кіру сілтемесі бар хаттар.",
          ],
        },
        "Canvas лентасын қоссаңыз, UniOS оны сіздің сілтемеңіз бойынша Instructure серверлерінен оқиды.",
      ],
    },
    {
      id: "storage",
      title: "Деректер қайда сақталады",
      blocks: [
        "Қазір дерекқор мен сервер Үндістанда орналасқан. Бұл — трансшекаралық беру (№ 94-V Заңның 16-бабы), біз оны сіздің келісіміңіз негізінде жүзеге асырамыз.",
        "Заң дербес деректерді Қазақстан аумағындағы дерекқорда (12-баптың 2-тармағы), ал анықтамалар сияқты қолжетімділігі шектеулі деректерді Қазақстандағы деректер орталығында сақтауды талап етеді. Сондықтан қазір UniOS демо-аккаунттары бар оқу MVP ретінде жұмыс істейді. Студенттердің нақты деректерімен пилотқа дейін дерекқор мен серверді қазақстандық деректер орталығына көшіреміз.",
        "Көшіргенге дейін нақты медициналық анықтамаларды жүктемеңіз — сынақ файлдарын пайдаланыңыз.",
      ],
    },
    {
      id: "retention",
      title: "Қанша уақыт сақтаймыз",
      blocks: [
        {
          table: [
            ["Аккаунт және оқу жазбалары", "Аккаунт жұмыс істеп тұрғанша. Жойылғаннан кейін — 30 күнге дейін, университет заң бойынша сақтауға міндетті жазбалардан басқа"],
            ["Медициналық анықтама файлы", `шешімнен кейін ${r.certificates} күн; шешімнің өзі журналда қалады`],
            ["Кіру тарихы", `${r.signIns} күн`],
            ["Оқылған хабарламалар", `${r.readNotifications} күн`],
            ["Пайдалану оқиғалары", `аккаунтқа байланысты ${r.identifiedEvents} күн, содан кейін иесіздендіріледі`],
            ["Қабылданбаған оқытушы өтінімдері", `шешімнен кейін ${r.rejectedApplications} күн; кез келген өтінімдегі IP-мекенжай — ${r.applicationIps} күн`],
            ["Кіру және Telegram байланыстыру сілтемелері", "мерзімі өткеннен кейін бір тәулік"],
          ],
        },
        "Жою әр түнде автоматты түрде орындалады.",
      ],
    },
    {
      id: "security",
      title: "Деректерді қалай қорғаймыз",
      blocks: [
        {
          list: [
            "Бүкіл жолда HTTPS және HSTS; дерекқор провайдердің дискісінде шифрланады.",
            "Құпиясөздер — bcrypt; сессия — қол қойылған httpOnly-cookie; барлық құрылғылардан шығуға болады.",
            "5 қате құпиясөзден кейін кіру 15 минутқа бұғатталады.",
            "Row Level Security: пайдаланушы атынан жасалған әр сұрау тек оған рұқсат етілген жолдарды көреді, ал құпиясөз хэштері мен токендер мұндай сұрауларға да қолжетімсіз.",
            "Анықтамалар мен жұмыстардың файлдары тек қолжетімділік тексерілгеннен кейін беріліп, браузердің оқшауланған режимінде ашылады.",
          ],
        },
        "Деректер жария болып қалса, уәкілетті органды және сізді бір жұмыс күнінен кешіктірмей хабардар етеміз.",
      ],
    },
    {
      id: "rights",
      title: "Сіздің құқықтарыңыз",
      blocks: [
        {
          list: [
            "Деректеріңіздің көшірмесін алу: Профиль → «Менің деректерім» → «Деректерімді жүктеп алу» (JSON файл).",
            "Деректерді түзету: тіл мен баптаулар — профильде, бағалар мен қатысу — оқытушы арқылы, қалғаны — эдвайзер арқылы.",
            `Келісімді кері қайтарып алу: Профиль → «Менің деректерім». Хабарламаларды бірден тоқтатамыз, Telegram, күнтізбе мен Canvas-ты ажыратамыз және барлық құрылғылардан шығарамыз. ${r.afterWithdrawal} күн ішінде (15 жұмыс күнінен кешіктірмей, 8-баптың 7-тармағы) хабарламаларды, еске салғыштарды және кіру тарихын жойып, статистиканы иесіздендіреміз. Оқу жазбалары университетте қалады.`,
            "Заң бұзылып өңделген деректерді бұғаттауды немесе жоюды талап ету.",
            "Уәкілетті органға — ҚР Жасанды интеллект және цифрлық даму министрлігіне шағымдану.",
          ],
        },
      ],
    },
    {
      id: "ai",
      title: "Жасанды интеллект",
      blocks: [
        "Қазір UniOS деректеріңізді өңдеу үшін ЖИ қолданбайды. ЖИ-көмекші пайда болса, бұл саясатты алдын ала жаңартамыз, ЖИ жауаптарын белгілейміз (ҚР «Жасанды интеллект туралы» Заңы) және бөлек келісім сұраймыз.",
      ],
    },
    {
      id: "changes",
      title: "Саясаттың өзгеруі",
      blocks: ["Саясаттың нұсқасы мен күні бар. Оны елеулі өзгертсек, келесі кіргенде келісімді қайта сұраймыз."],
    },
    {
      id: "contact",
      title: "Бізбен қалай байланысуға болады",
      blocks: ["Деректеріңіз бойынша сұрауларды тобыңыздың эдвайзері және UniOS командасы қабылдайды."],
    },
  ],
});

const en = (r: R): LegalDoc => ({
  title: "Privacy Policy",
  lead:
    "UniOS is a student project at Narxoz University: schedule, deadlines, grades, attendance and announcements in one place, with reminders in Telegram. " +
    "This page explains what data about you we process, why, where and for how long we keep it, and how you can control it. We follow Kazakhstan's Law " +
    "No. 94-V “On Personal Data and Their Protection” (as amended in 2026), the Digital Code of Kazakhstan and the principles of the GDPR.",
  sections: [
    {
      id: "operator",
      title: "Who processes your data",
      blocks: [
        "The operator is the team of the UniOS student project (Narxoz University, Almaty). Until the project is registered as a legal entity, the project lead is accountable for processing, and a team member is appointed to organise the processing of personal data.",
        "When a university connects UniOS under a contract, the university remains the owner of the academic data and UniOS processes it on the university's behalf.",
      ],
    },
    {
      id: "data",
      title: "What data we process",
      blocks: [
        {
          list: [
            "Account: full name, email, role (student, teacher, advisor), interface language. Your password is stored only as a bcrypt hash — nobody knows the password itself.",
            "Student's studies: group, courses and schedule, deadlines and completion marks, uploaded work, grades and teacher comments, attendance (including QR check-ins), excused-absence requests and medical certificates.",
            "Teacher's work: courses, schedule, announcements, grades and attendance entered. When applying for an account: the application with subjects, timetable, a comment and the IP address.",
            "Messaging: Telegram chat ID if you connect the bot; reminder settings; in-app notifications; your Canvas calendar feed address if you add it.",
            "Security: sign-in history — time, IP address and browser. It is used to stop password guessing and to show you recent sign-ins.",
            "Usage: events such as “opened a deadline from a reminder”. They tell us whether reminders help.",
          ],
        },
        "Medical certificates are health data, i.e. restricted-access data. Only you, the teacher of that class and your group's advisor can see them.",
        "We do not collect payment data, biometrics or location. Cookies are strictly necessary only: uni_session (sign-in, 30 days) and locale (language). No advertising or third-party trackers; fonts are served from our own server.",
      ],
    },
    {
      id: "purposes",
      title: "Why, and on what legal basis",
      blocks: [
        {
          list: [
            "To show your schedule, deadlines, grades, attendance and announcements, and to remind you of due dates.",
            "To protect your account: lockout after wrong passwords, signing out everywhere, the sign-in log.",
            "To improve the product using de-identified and aggregated statistics.",
          ],
        },
        "The legal basis is your consent (Law No. 94-V, art. 7–8), given at your first sign-in or in a teacher's application. It lasts while you have an account, and you can withdraw it at any time.",
        "We do not sell data, show ads or train AI on your data.",
      ],
    },
    {
      id: "decisions",
      title: "People make the decisions",
      blocks: [
        "UniOS makes no automated decisions that change your rights (Law No. 94-V, art. 19-1; Digital Code, art. 43). Grades, absences, certificates and teacher applications are decided by people — a teacher or an advisor.",
        "A QR check-in only marks you “present” or “late”, and the teacher can correct it. The absence counter and the GPA “what if” mode are hints with an open formula, not decisions.",
        "If you disagree with an outcome, write to your teacher or advisor. We answer objections to automated processing within 3 working days.",
      ],
    },
    {
      id: "recipients",
      title: "Who sees the data",
      blocks: [
        {
          list: [
            "You.",
            "Teachers — students of their own courses: grades, attendance, work and certificates for their own classes.",
            "Advisors — students of their own groups, and teacher applications.",
            "The UniOS team — only to fix errors and answer your requests.",
          ],
        },
        "Processors we share data with to run the service:",
        {
          list: [
            "Supabase Inc. — PostgreSQL database on AWS servers (region ap-south-1, Mumbai, India).",
            "Vercel Inc. — website hosting (functions in region bom1, Mumbai).",
            "Telegram — delivery of reminders and bot replies, if you connect the bot.",
            "Resend — sign-in link emails, if that feature is turned on.",
          ],
        },
        "If you add a Canvas feed, UniOS reads it from Instructure's servers using your link.",
      ],
    },
    {
      id: "storage",
      title: "Where the data is stored",
      blocks: [
        "The database and server are currently in India. This is a cross-border transfer (Law No. 94-V, art. 16), which we make on the basis of your consent.",
        "The law requires personal data to be stored in a database located in Kazakhstan (art. 12(2)), and restricted-access data such as certificates in a data centre in Kazakhstan. That is why UniOS currently runs as a student MVP with demo accounts. Before any pilot with real student data we will move the database and server to a Kazakh data centre.",
        "Until then, please do not upload real medical certificates — use test files.",
      ],
    },
    {
      id: "retention",
      title: "How long we keep it",
      blocks: [
        {
          table: [
            ["Account and academic records", "While the account exists. After deletion — up to 30 days, except records the university must keep by law"],
            ["Medical certificate file", `${r.certificates} days after the decision; the decision itself stays in the journal`],
            ["Sign-in history", `${r.signIns} days`],
            ["Read notifications", `${r.readNotifications} days`],
            ["Usage events", `${r.identifiedEvents} days linked to the account, then de-identified`],
            ["Rejected teacher applications", `${r.rejectedApplications} days after the decision; the IP address in any application — ${r.applicationIps} days`],
            ["Sign-in and Telegram link tokens", "one day after they expire"],
          ],
        },
        "Deletion runs automatically every night.",
      ],
    },
    {
      id: "security",
      title: "How we protect it",
      blocks: [
        {
          list: [
            "HTTPS end to end and HSTS; the database is encrypted at rest by the provider.",
            "Passwords — bcrypt; the session — a signed httpOnly cookie; you can sign out of every device.",
            "After 5 wrong passwords, sign-in is locked for 15 minutes.",
            "Row Level Security: every query made on a user's behalf sees only the rows allowed to them, and password hashes and tokens are out of reach even for such queries.",
            "Certificate and work files are served only after an access check and open in the browser's sandboxed mode.",
          ],
        },
        "If a breach happens, we will notify the authorised body and you within one working day.",
      ],
    },
    {
      id: "rights",
      title: "Your rights",
      blocks: [
        {
          list: [
            "Get a copy of your data: Profile → “My data” → “Download my data” (a JSON file).",
            "Correct your data: language and settings in your profile, grades and attendance through your teacher, everything else through your advisor.",
            `Withdraw consent: Profile → “My data”. We immediately stop messages, disconnect Telegram, the calendar feed and Canvas, and sign you out everywhere. Within ${r.afterWithdrawal} days (no later than 15 working days, art. 8(7)) we delete notifications, reminders and sign-in history and de-identify usage statistics. Academic records stay with the university.`,
            "Demand that data processed unlawfully be blocked or deleted.",
            "Complain to the authorised body — the Ministry of Artificial Intelligence and Digital Development of Kazakhstan.",
          ],
        },
      ],
    },
    {
      id: "ai",
      title: "Artificial intelligence",
      blocks: [
        "UniOS does not use AI to process your data today. If we add an AI assistant, we will update this policy first, label AI answers (Kazakhstan's Law on Artificial Intelligence) and ask for separate consent.",
      ],
    },
    {
      id: "changes",
      title: "Changes to this policy",
      blocks: ["The policy has a version and a date. If we change it materially, we will ask for your consent again at your next visit."],
    },
    {
      id: "contact",
      title: "How to reach us",
      blocks: ["Requests about your data are handled by your group's advisor and the UniOS team."],
    },
  ],
});

export function privacyDoc(locale: Locale): LegalDoc {
  return { ru, kk, en }[locale](RETENTION_DAYS);
}
