// Terms of use shown at /terms.
import type { Locale } from "../time";
import type { LegalDoc } from "./doc";

export const TERMS_UPDATED = new Date("2026-11-25T00:00:00+05:00");

const ru: LegalDoc = {
  title: "Условия использования",
  lead: "Короткие правила, по которым работает UniOS. Пользуясь сайтом или Telegram-ботом, вы принимаете эти условия и Политику конфиденциальности.",
  sections: [
    {
      id: "service",
      title: "Что такое UniOS",
      blocks: [
        "UniOS — учебный MVP команды студентов Narxoz University. Он собирает расписание, дедлайны, оценки, посещаемость и объявления и напоминает о сроках. Сервис бесплатный и может работать с перерывами, пока проект в разработке.",
        "Официальные оценки и посещаемость хранятся в системах университета. Если запись в UniOS расходится с университетской, верна университетская.",
      ],
    },
    {
      id: "accounts",
      title: "Аккаунты",
      blocks: [
        {
          list: [
            "Аккаунты студентов выдаёт эдвайзер; преподаватели подают заявку, её одобряет эдвайзер.",
            "Аккаунт личный: не передавайте пароль и не входите под чужим аккаунтом.",
            "Если подозреваете, что пароль узнали, смените его и нажмите «Выйти на всех устройствах» в профиле.",
          ],
        },
      ],
    },
    {
      id: "rules",
      title: "Что нельзя",
      blocks: [
        {
          list: [
            "Отмечаться по QR-коду за другого человека или передавать код тем, кого нет на занятии.",
            "Загружать вредоносные файлы, чужие работы без указания автора и чужие персональные данные без согласия.",
            "Пытаться обойти защиту, подбирать пароли или читать данные, к которым у вас нет доступа.",
          ],
        },
        "За нарушения эдвайзер может заблокировать аккаунт; нарушения академической честности рассматривает университет.",
      ],
    },
    {
      id: "content",
      title: "Ваши материалы",
      blocks: [
        "Работы, файлы и объявления, которые вы загружаете, остаются вашими. Вы разрешаете UniOS хранить их и показывать тем, кому они предназначены (преподавателю, группе), — только для работы сервиса.",
      ],
    },
    {
      id: "ip",
      title: "Интеллектуальная собственность",
      blocks: [
        "Код, дизайн и название UniOS принадлежат команде проекта. Название и логотип Narxoz принадлежат Narxoz University. Открытые библиотеки, на которых построен UniOS, используются по их лицензиям — список на странице «Открытые лицензии».",
      ],
    },
    {
      id: "liability",
      title: "Ответственность",
      blocks: [
        "Мы делаем всё, чтобы напоминания приходили вовремя, но не отвечаем за пропущенный срок, если сообщение не дошло из-за сбоя Telegram, сети или устройства. Проверяйте важные сроки у преподавателя.",
      ],
    },
    {
      id: "changes",
      title: "Изменения",
      blocks: ["Мы можем обновлять эти условия; дата редакции указана вверху страницы. Вопросы — эдвайзеру вашей группы или команде UniOS."],
    },
  ],
};

const kk: LegalDoc = {
  title: "Пайдалану шарттары",
  lead: "UniOS жұмыс істейтін қысқа ережелер. Сайтты немесе Telegram-ботты пайдалана отырып, сіз осы шарттарды және Құпиялылық саясатын қабылдайсыз.",
  sections: [
    {
      id: "service",
      title: "UniOS деген не",
      blocks: [
        "UniOS — Narxoz University студенттері командасының оқу MVP-і. Ол кестені, дедлайндарды, бағаларды, қатысуды және хабарландыруларды жинап, мерзімдерді еске салады. Сервис тегін және жоба әзірленіп жатқанда үзілістермен жұмыс істеуі мүмкін.",
        "Ресми бағалар мен қатысу университет жүйелерінде сақталады. UniOS-тағы жазба университеттікінен өзгеше болса, университеттікі дұрыс.",
      ],
    },
    {
      id: "accounts",
      title: "Аккаунттар",
      blocks: [
        {
          list: [
            "Студенттердің аккаунттарын эдвайзер береді; оқытушылар өтінім жібереді, оны эдвайзер мақұлдайды.",
            "Аккаунт жеке: құпиясөзді бермеңіз және басқа біреудің аккаунтымен кірмеңіз.",
            "Құпиясөзді біреу білді деп ойласаңыз, оны өзгертіп, профильде «Барлық құрылғылардан шығу» батырмасын басыңыз.",
          ],
        },
      ],
    },
    {
      id: "rules",
      title: "Не істеуге болмайды",
      blocks: [
        {
          list: [
            "Басқа адамның орнына QR-код арқылы белгі қоюға немесе кодты сабақта жоқ адамдарға беруге.",
            "Зиянды файлдарды, авторын көрсетпей басқа біреудің жұмыстарын және келісімсіз басқа адамдардың дербес деректерін жүктеуге.",
            "Қорғанысты айналып өтуге, құпиясөздерді таңдауға немесе қолжетімділігіңіз жоқ деректерді оқуға тырысуға.",
          ],
        },
        "Бұзушылықтар үшін эдвайзер аккаунтты бұғаттай алады; академиялық адалдықты бұзуды университет қарайды.",
      ],
    },
    {
      id: "content",
      title: "Сіздің материалдарыңыз",
      blocks: [
        "Сіз жүктейтін жұмыстар, файлдар мен хабарландырулар сіздікі болып қалады. Сіз UniOS-қа оларды сақтауға және кімге арналса, соларға (оқытушыға, топқа) көрсетуге рұқсат бересіз — тек сервистің жұмысы үшін.",
      ],
    },
    {
      id: "ip",
      title: "Зияткерлік меншік",
      blocks: [
        "UniOS коды, дизайны және атауы жоба командасына тиесілі. Narxoz атауы мен логотипі Narxoz University-ге тиесілі. UniOS негізделген ашық кітапханалар өз лицензиялары бойынша қолданылады — тізімі «Ашық лицензиялар» бетінде.",
      ],
    },
    {
      id: "liability",
      title: "Жауапкершілік",
      blocks: [
        "Еске салғыштар уақытында келуі үшін бәрін жасаймыз, бірақ хабар Telegram, желі немесе құрылғы ақаулығынан жетпесе, өткізіп алынған мерзімге жауап бермейміз. Маңызды мерзімдерді оқытушыдан тексеріңіз.",
      ],
    },
    {
      id: "changes",
      title: "Өзгерістер",
      blocks: ["Бұл шарттарды жаңартуымыз мүмкін; редакция күні беттің жоғарғы жағында көрсетілген. Сұрақтар — тобыңыздың эдвайзеріне немесе UniOS командасына."],
    },
  ],
};

const en: LegalDoc = {
  title: "Terms of Use",
  lead: "The short rules UniOS runs by. By using the website or the Telegram bot you accept these terms and the Privacy Policy.",
  sections: [
    {
      id: "service",
      title: "What UniOS is",
      blocks: [
        "UniOS is a student MVP built by a team at Narxoz University. It brings together your schedule, deadlines, grades, attendance and announcements and reminds you of due dates. It is free and may have interruptions while the project is in development.",
        "Official grades and attendance are kept in the university's systems. If a record in UniOS differs from the university's, the university's record is correct.",
      ],
    },
    {
      id: "accounts",
      title: "Accounts",
      blocks: [
        {
          list: [
            "Student accounts are issued by an advisor; teachers apply, and an advisor approves.",
            "Your account is personal: do not share your password or sign in as someone else.",
            "If you think someone knows your password, change it and press “Sign out everywhere” in your profile.",
          ],
        },
      ],
    },
    {
      id: "rules",
      title: "What is not allowed",
      blocks: [
        {
          list: [
            "Checking in with a QR code for someone else, or passing the code to people who are not in class.",
            "Uploading malware, other people's work without credit, or other people's personal data without their consent.",
            "Trying to bypass security, guess passwords or read data you have no access to.",
          ],
        },
        "An advisor may block an account for violations; breaches of academic integrity are handled by the university.",
      ],
    },
    {
      id: "content",
      title: "Your content",
      blocks: [
        "Work, files and announcements you upload remain yours. You allow UniOS to store them and show them to the people they are meant for (your teacher, your group) — only to run the service.",
      ],
    },
    {
      id: "ip",
      title: "Intellectual property",
      blocks: [
        "The UniOS code, design and name belong to the project team. The Narxoz name and logo belong to Narxoz University. The open-source libraries UniOS is built on are used under their licences — see “Open-source licences”.",
      ],
    },
    {
      id: "liability",
      title: "Liability",
      blocks: [
        "We do our best to deliver reminders on time, but we are not responsible for a missed deadline if a message did not arrive because of a Telegram, network or device failure. Check important deadlines with your teacher.",
      ],
    },
    {
      id: "changes",
      title: "Changes",
      blocks: ["We may update these terms; the date of this edition is shown at the top of the page. Questions go to your group's advisor or the UniOS team."],
    },
  ],
};

export function termsDoc(locale: Locale): LegalDoc {
  return { ru, kk, en }[locale];
}
