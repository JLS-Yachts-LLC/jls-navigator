// "Respect on board — harassment, bullying and your rights" — JLS library course for
// every crew member, in the Crew Academy content shape (src/lib/academy/content.ts).
// Files are referenced by name ("@rb-01-cover.png") and swapped for academy_media ids
// by buildCourse(mediaIds) once uploaded.
//
// Content checked on 19 October 2026 against:
// - ILO Maritime Labour Convention, 2006, as amended (text of the Regulations, Standards
//   and Guidelines as reproduced by inview.nl and the ILO MLC FAQ, faqmlc.ilo.org):
//   Reg. 2.1 / Std A2.1(1)(b) (examine and seek advice on the SEA before signing);
//   Std A2.2 (wages at no greater than monthly intervals, monthly account);
//   Std A2.3 paras 5 and 6 (10 h rest in any 24 h and 77 h in any 7 days, or max 14 h
//   work in 24 h and 72 h in 7 days; rest in no more than two periods, one at least 6 h;
//   no more than 14 h between rest periods), paras 7, 10, 12, 14 (drills, posted
//   schedule, records with the seafarer's endorsed copy, master's safety override);
//   Std A2.4 para 2 (at least 2.5 calendar days' paid leave per month) and Reg 2.4
//   (shore leave); Std A2.5.1 (repatriation at no cost; service period less than 12
//   months); Reg 3.1 / 3.2, Reg 4.1 (care on board and ashore, in principle at no cost);
//   Reg 5.1.5, Std A5.1.5 and Guideline B5.1.5 (on-board complaint procedure: lowest
//   level first — HoD, then master — but always the right to go straight to the master
//   or outside; to be accompanied; no victimisation unless manifestly vexatious or
//   malicious; a copy of the procedure with the SEA, with flag-state contacts and a
//   named person on board for confidential impartial advice).
// - Reg 5.1.3 / flag guidance (Marshall Islands Yacht TechCirc, Clyde & Co via
//   SuperyachtNews): the MLC applies to yachts ordinarily engaged in commercial activity
//   of any size; certification is mandatory at 500 GT and over on international voyages.
// - 2016 amendments (in force 8 January 2019; Lloyd's Register Class News 29/2017, Hong
//   Kong MARDEP): Guideline B4.3.1 refers to the ICS/ITF harassment guidance and adds
//   harassment and bullying; B4.3.6(2)(g) investigations.
// - 2022 amendments (in force 23 December 2024; ILO news release): recruitment,
//   repatriation, social connectivity / internet at reasonable cost, free good-quality
//   drinking water and balanced meals, prompt disembarkation for urgent medical care,
//   properly fitting PPE (incl. for women seafarers), financial security. They did NOT
//   add harassment rules; the 2022 meeting also adopted a (non-binding) resolution on
//   harassment and bullying, including sexual assault and sexual harassment.
// - 2025 amendments (5th STC April 2025, approved by the 113th ILC June 2025; DNV,
//   BIMCO, Britannia P&I, Holland & Knight): harassment, bullying, sexual harassment and
//   sexual assault written into Std A4.3 and the complaint procedure A5.1.5 (plus
//   B1.4.1, B3.1.10, B4.3.1, B4.3.6, B4.3.11); expected in force 23 December 2027.
// - ICS / ITF "Guidance on eliminating shipboard harassment and bullying" (2016, primary
//   PDF): definitions (unwelcome conduct, intentionally or not; bullying as hostile or
//   vindictive behaviour, often a misuse of power, can be unintended), examples incl.
//   cyber bullying and "hidden" bullying excuses, informal and formal process,
//   confidentiality, accompaniment, victimisation, same-gender investigator where
//   possible, move the perpetrator not the victim, bystanders' role.
// - ISWAN SeafarerHelp (iswan.org.uk/seafarerhelp): free, confidential, multilingual,
//   24 hours a day, 365 days a year; phone +44 20 7323 2737, WhatsApp +44 7909 470732,
//   live chat, the ISWAN for Seafarers app.
// - ITF Seafarers (itfseafarers.org/en/contact-us): nearest ITF inspector, ITF Seafarers
//   app, seafsupport@itf.org.uk.
// Not legal advice; a yacht's own policy, the SEA, any collective agreement and the flag
// state's law apply on top of (and may give more than) the MLC minimums.
import { reading, image, video, ack, quiz, hotspot, match, order, sort, lesson, section, makeBuild } from "../blocks.mjs";
import { SPOTS } from "./pictures.mjs";

export const COURSE = {
  title: "Respect on board — harassment, bullying and your rights",
  category: "Crew conduct",
  minutes: 40,
  passMark: 80,
  refreshMonths: 12,
  summary:
    "Your rights under the Maritime Labour Convention in plain terms: your contract, pay, leave, hours of rest, getting home and how to complain. Then what harassment and bullying are, what to do if it happens to you or in front of you, what HoDs and officers must do when someone comes to them, and how to keep a crew respectful.",
};

export function content() {
  return {
    sections: [
      section("Your rights at sea", [
        lesson("Welcome: respect on board", [
          image("rb-01-cover.png", "Respect on board"),
          reading(`
            A yacht is a workplace, but for months at a time it's also your home. You live, eat, sleep and work with the same small group of people, often far from family and friends, and you can't just go home at the end of the day.

            That makes respect matter more on board than almost anywhere else. When it goes wrong, through harassment, bullying, unfair hours or a contract that isn't honoured, it affects your health, your safety and the whole crew.

            This course covers:

            - **Your rights** under the Maritime Labour Convention: your contract, pay, leave, hours of rest, medical care and getting home.
            - **Harassment and bullying**: what they are and aren't, including in crew group chats and at crew parties.
            - **What to do** if it happens to you, or if you see it happen to someone else.
            - **For HoDs and officers**: what to do when someone comes to you.
            - **A respectful crew**: living and working well together.

            Nothing in this course is about blame. If something has happened to you, it is not your fault, and you have the right to get help.
          `),
          reading(`
            ### What protects you: the MLC

            The **Maritime Labour Convention, 2006 (MLC)** is the International Labour Organization's (ILO) "bill of rights" for seafarers. Flag states that have ratified it write it into their own law.

            **Does it apply to your yacht?** The MLC covers seafarers on ships *ordinarily engaged in commercial activities*, and that includes commercial and charter yachts of any size. Yachts of 500 GT and over on international voyages must also carry a **Maritime Labour Certificate** and are inspected against it. A private yacht that isn't used commercially may be outside the MLC; it then follows its flag state's rules and its own policy. **If you're not sure, check your SEA and the yacht's policy, or ask your crew agent.**

            **What's new.** The MLC is updated every few years:

            - Since **8 January 2019**, the MLC's guidance has asked governments to deal with **harassment and bullying**, using the industry's *Guidance on eliminating shipboard harassment and bullying* (ICS and ITF, 2016). This course is based on that guidance.
            - Changes in force since **23 December 2024** brought **free drinking water** and balanced meals, **internet access** on board at a reasonable cost where practicable, **protective equipment that fits** (including for women), quicker help ashore for urgent medical care, and more help getting home.
            - Further changes agreed in 2025, expected to come into force in **December 2027**, will make preventing harassment, bullying, sexual harassment and sexual assault part of the MLC's binding rules, and strengthen the complaint procedure.

            The MLC sets **minimums**. Your SEA, the yacht's policy or the flag state's law can give you more, never less.
          `),
          quiz("Check your understanding", [
            ["truefalse", "The MLC applies to commercial and charter yachts, not only to cargo ships and cruise ships.", true, "The MLC covers seafarers on ships ordinarily engaged in commercial activities, including commercial yachts of any size. Larger ones (500 GT and over, international voyages) must also be certified."],
            ["single", "You work on a private yacht that's never chartered. Where do you find your rights?", ["Nowhere: private yachts have no rules", "Only in the MLC", "*In your SEA, the yacht's policy and the flag state's rules: check them, or ask your crew agent", "Only in the yacht's insurance policy"], "A private yacht may be outside the MLC, but your contract, the yacht's policy and the flag state's law still apply."],
            ["truefalse", "Since the changes that came into force on 23 December 2024, drinking water on board must be free of charge.", true, "The 2022 amendments, in force since 23 December 2024, require good-quality drinking water free of charge, and balanced meals."],
          ]),
        ]),
        lesson("Your contract, pay, leave and getting home", [
          reading(`
            ### Your Seafarer Employment Agreement (SEA)

            - It must be **in writing** and signed by you and the shipowner (or someone for them).
            - You must get the chance to **read it and get advice before you sign**. Nobody should rush or pressure you.
            - **Keep your signed copy** somewhere safe, and a photo of it on your phone.
            - It sets out your wages, leave, notice and repatriation. You also get a record of your service on board.

            ### Wages

            Paid in full, at least **once a month**, as your SEA says, with a monthly account of what you're paid and any deductions. Tips are usually shared under the yacht's own system: ask how it works.

            ### Leave

            At least **2.5 calendar days of paid annual leave for each month** you work, unless your SEA gives more. You can't be made to give up that minimum. You should also get **shore leave** when the yacht's work allows, for your health and wellbeing.

            ### Getting home (repatriation)

            You're entitled to be sent home **at no cost to you** when your contract ends, if you're ill or injured, or if the owner can't keep to the contract. The maximum time on board before you can go home must be **less than 12 months**. The shipowner can't make you pay towards it up front or take it out of your wages (unless you've been dismissed for serious misconduct, under the rules that apply to you).

            ### Medical care, food and a cabin

            - **Medical care** on board and ashore, quickly and in principle **at no cost** to you, including seeing a doctor or dentist in port where practicable.
            - **Food and drinking water free of charge**, balanced and of good quality.
            - **Decent accommodation**, and access to communication, including internet at a reasonable cost where practicable.

            ### Complaints

            You can complain about any of this without being punished for it. You'll find out exactly how later in the course.
          `),
          image("rb-02-your-rights.png", "Your rights on board, in plain terms"),
          match("Know your rights", "Match each right with what it means for you.", [
            ["Your SEA", "Read it and get advice before you sign, and keep a signed copy"],
            ["Wages", "Paid at least monthly, with an account of what you're paid"],
            ["Annual leave", "At least 2.5 calendar days for each month worked"],
            ["Repatriation", "Home at no cost to you, and before 12 months on board"],
            ["Medical care", "Prompt care on board and ashore, in principle free"],
            ["Food and drinking water", "Free of charge while you're on board"],
          ]),
          quiz("Your contract and pay", [
            ["single", "You're handed your SEA on the dock and told to sign it now, as the yacht is about to leave. What does the MLC say?", ["You must sign straight away or lose the job", "*You must be given the chance to read it and get advice before you sign", "The Captain can sign it for you", "You can sign it later, at the end of the season"], "Under Standard A2.1 you must be able to examine your SEA and seek advice before signing. Ask for time, and keep a signed copy."],
            ["truefalse", "The cost of getting you home at the end of your contract can be taken out of your last month's wages.", false, "Repatriation is at no cost to you. It can only be recovered in narrow cases, such as dismissal for serious misconduct under the rules that apply."],
            ["single", "How often must wages be paid under the MLC?", ["Every three months", "At the end of the season", "*At least once a month", "Whenever the owner is on board"], "Wages are paid at no greater than monthly intervals, with a monthly account of payments."],
          ]),
        ]),
        lesson("Hours of work and rest", [
          reading(`
            Tiredness causes accidents, mistakes and short tempers. That's why the MLC limits hours. Your flag state uses **one** of two systems:

            **Minimum hours of rest** (the one most yachts use):

            - At least **10 hours of rest in any 24-hour period**, and
            - At least **77 hours of rest in any 7-day period**.
            - Rest can be split into **no more than two periods**, and **one of them must be at least 6 hours** long.
            - There must be **no more than 14 hours** between one rest period and the next.

            **Or maximum hours of work:** no more than **14 hours of work in any 24 hours** and **72 hours in any 7 days**.

            *Any* 24 hours means any 24 hours, not just midnight to midnight. A rest period that runs past midnight counts as one period. Watchkeepers have the same 10 and 77 hour limits under STCW.

            **Also good to know:**

            - A **table of working arrangements** (the schedule) must be posted where crew can see it.
            - **Drills** should disturb your rest as little as possible. If you're on call and get called out during rest, you should get that rest back.
            - In an **emergency** (the safety of the yacht, the people on board or another ship in distress) the Captain can suspend the schedule. Afterwards, you get adequate rest.

            ### Your record of hours of rest

            The yacht keeps a record of your hours, and **you get a copy, signed by the Captain (or someone they authorise) and by you**. Write down the hours you really worked. Never sign a record you know is wrong, and if you're asked to change one so it "looks right", raise it: that's what the complaint procedure is for.
          `),
          image("rb-03-rest-rules.png", "The rest-hours rules on one page"),
          video("rb-a1-rest-hours.mp4", "Animation: how the rest-hours rule works"),
          hotspot("Check the record", "Here's a deckhand's record of hours of rest for a busy charter week. One day breaks the rest rules. Tap that day.", "rb-04-rest-record.png", SPOTS.badDay),
          quiz("Hours of rest", [
            ["single", "On Thursday the deckhand had 9½ hours of rest. Which rule does that break?", ["*At least 10 hours of rest in any 24 hours", "At least 77 hours in any 7 days", "No more than 14 hours between rest periods", "None: it's a charter week, so the rules don't apply"], "Below 10 hours in a 24-hour period breaks the rule, even though the week's total of 90½ hours is well over 77. Both rules apply."],
            ["single", "You had 11 hours of rest, split into 4, 4 and 3 hours. Is that within the rules?", ["Yes: 11 is more than 10", "*No: rest can be in no more than two periods, and one must be at least 6 hours", "Yes, as long as the week adds up to 77", "Only if the Captain agrees"], "The total isn't enough on its own. No more than two periods, one of them 6 hours or longer."],
            ["truefalse", "You should get a copy of your own record of hours of rest, signed by the Captain (or someone they authorise) and by you.", true, "Standard A2.3 says you receive a copy of your records, endorsed by the master and by you. Keep them."],
          ]),
        ]),
      ]),

      section("Harassment and bullying", [
        lesson("What harassment and bullying are", [
          reading(`
            The ICS and ITF guidance used by the MLC describes them like this, in short:

            **Harassment** is any inappropriate and unwelcome behaviour that makes someone feel uneasy, humiliated, embarrassed or uncomfortable, **whether it was meant to or not**.

            **Bullying** is a kind of harassment: hostile or vindictive behaviour that makes someone feel threatened or intimidated. It's often a misuse of power or position and often keeps happening, but it can also happen when someone doesn't realise the effect they're having.

            **Examples of harassment:**

            - Offensive or sexual jokes, pictures or messages; sexist, racist or homophobic remarks.
            - Comments about someone's body, looks or character that embarrass or upset them.
            - Unwanted attention: staring, following, pestering, touching, brushing against someone.
            - Prying questions about someone's sex life, relationship, religion, culture or background.
            - Spreading rumours, or insulting someone because of their age, race, sex, sexual orientation, religion, disability or pregnancy.

            **Examples of bullying:**

            - Shouting, swearing at or threatening someone, in public or in private.
            - Belittling someone or their work, especially in front of others.
            - Constant, unfair criticism; picking on small mistakes; watching everything they do.
            - Giving someone pointless or humiliating jobs, or taking their work away for no reason.
            - Leaving someone out of meals, nights out or conversations on purpose.
            - Threats about their job, contract, tips or reference.

            ### Banter or crossing the line?

            Friendly banter between people who are **equals**, who **both enjoy it** and **could say the same back**, is part of crew life. It crosses the line when:

            - it's one-sided, or the person it's about isn't really laughing;
            - it's about who someone is: their race, nationality, sex, religion, body, accent;
            - it keeps going after someone has made clear, in any way, that they don't like it;
            - there's a power gap, so they can't safely answer back.

            **What matters is how it lands, not what you meant.** Watch out for the excuses that hide bullying: "it's just banter", "they can't take a joke", "they're too sensitive", "it's a personality clash", "that's just how I manage".
          `),
          image("rb-05-the-line.png", "Banter or crossing the line? Four questions to ask yourself"),
          sort("Banter or crossing the line?", "Put each situation in the right group.", ["Banter between equals", "Crossing the line"], [
            ["Two deckhands joke about whose turn it is to clean the tender, and both are laughing", 0],
            ["A nickname about someone's accent that they've asked people to stop using", 1],
            ["Teasing a friend about their football team, and they tease you back just as hard", 0],
            ["A senior officer mocks a junior crew member's mistake in front of the guests", 1],
            ["Commenting on a crewmate's body as they walk past", 1],
            ["Laughing together at a mistake you've told everyone about yourself", 0],
            ["Leaving one person out of every crew night out on purpose", 1],
            ["Asking a crewmate out again and again after they've said no", 1],
          ]),
          quiz("Harassment and bullying", [
            ["truefalse", "If the person didn't mean to upset anyone, it can't be harassment.", false, "Harassment is about the effect on the person receiving it. Behaviour can be harassment whether it was intended or not."],
            ["single", "Which of these is the clearest sign that banter has become bullying?", ["People are laughing", "*The same person is always the target and can't safely answer back", "It happens in the crew mess", "It's about football"], "One-sided, repeated and with a power gap: that's bullying, whatever it's called."],
            ["multi", "Which of these can be harassment? Choose all that apply.", ["*Repeated comments about how someone looks", "*Jokes about someone's religion", "Asking a crewmate once if they'd like to join a group dinner", "*Prying questions about someone's sex life", "A fair, private conversation about a safety mistake"], "Unwelcome comments, jokes about who someone is and intrusive questions can all be harassment. A one-off friendly invitation, or fair feedback given privately, isn't."],
          ]),
        ]),
        lesson("Power, parties and group chats", [
          reading(`
            ### Power on board

            On a yacht, a lot can depend on a few people: who gets the good jobs, how tips are shared, whether your contract is renewed, the reference you'll need for your next job, sometimes even your visa. That **power gap** makes it hard to say no, or to speak up. Behaviour from someone more senior can feel threatening even when it isn't meant to be, and people with power have to be extra careful.

            **Nobody can make your job, tips or reference depend on putting up with harassment.** Suggesting that sexual favours could help someone's career, or that refusing could harm it, is serious sexual harassment.

            ### Sexual harassment

            Any unwanted behaviour of a sexual nature: comments, jokes, "compliments" about someone's body, messages or pictures, requests for dates after a no, touching, standing too close, brushing against someone. It can happen to anyone, of any gender, from anyone. As with all harassment, it's about the effect on the person, not the intention.

            ### Crew parties and alcohol

            Crew nights out and parties are part of yacht life. Follow your **yacht's drug and alcohol policy**, and remember:

            - **Alcohol is never an excuse.** What's not OK sober is not OK drunk.
            - Someone who is very drunk **can't consent** to anything sexual.
            - Look out for each other: get people home together, and step in if someone looks uncomfortable or unsafe.

            ### Group chats and social media (cyberbullying)

            The crew WhatsApp group is part of the workplace. Harassment and bullying count **online and off duty** too:

            - mocking messages, memes or nicknames about a crewmate;
            - sharing photos or videos of someone **without their consent**, including screenshots of their own posts;
            - "rating" people, sexual comments, or piling on;
            - making a separate group to talk about, or leave out, one person.

            If someone posts something like that: **don't react, don't share it, don't add to it**. Tell your HoD or the Captain, and check on the person it's about.
          `),
          video("rb-a2-banter-to-bullying.mp4", "Animation: from banter to bullying"),
          hotspot("Crossing the line in the chat", "This is the deck crew's group chat. Tap the message that crosses the line.", "rb-06-group-chat.png", SPOTS.chat),
          quiz("Power, parties and chats", [
            ["single", "Jules's message shares Sam's photos from their own Instagram and asks the crew to rate them. Why is this harassment?", ["It isn't: the photos were public", "*It shares Sam's pictures without consent and invites sexual comments about them", "Only because it was posted during working hours", "Only if Sam is in the group"], "Public on Instagram doesn't mean consent to being shared and rated by the crew. It's sexual harassment, wherever Sam happens to be."],
            ["truefalse", "If someone was drunk at a crew party, what they did doesn't count.", false, "Alcohol is never an excuse. The same standards apply drunk or sober, and the yacht's policy applies at crew events."],
            ["single", "Why can a joke from a Chief Officer land differently from the same joke from a fellow deckhand?", ["It can't: a joke is a joke", "*Because of the power gap: the junior can't safely answer back, and their job may feel at risk", "Because officers aren't allowed to joke", "Because officers have to be serious at all times"], "Rank, contracts, tips and references create a power gap. People with power have to be more careful about how their words land."],
          ]),
        ]),
      ]),

      section("If it happens", [
        lesson("If it happens to you", [
          reading(`
            **It is not your fault, and you don't have to put up with it.** Here's what you can do. You choose what feels right; you don't have to do everything, or do it in this order.

            **1. If you feel safe, say so.** Sometimes people really don't know they're upsetting you. Telling them clearly that it's unwelcome and asking them to stop can be enough. You never have to face someone who frightens you.

            **2. Keep notes.** Write down what happened as soon as you can: the date, time and place, what was said or done, and who saw it. Keep messages, screenshots and emails, but don't forward them around. Notes make a complaint much easier to deal with.

            **3. Tell someone you trust:** a crewmate, your HoD, another officer, or the person named in your complaint procedure as someone who can give **confidential, impartial advice**. You can bring a crewmate with you to any meeting, and you can ask someone to raise it on your behalf.

            **4. Use the on-board complaint procedure.** You should have been given a copy when you joined, with your SEA. Complaints are normally sorted out at the lowest level: first your **Head of Department**, then the **Captain**, who should deal with it personally. **But you always have the right to go straight to the Captain**, for example if your HoD is involved, **and to go outside the yacht**. Anything not settled on board goes ashore to the **company / DPA** (the Designated Person Ashore, who has a direct line to the top of the company), and you can contact your crew agent too.

            **5. You're protected.** The MLC says nobody may victimise you for making a complaint. Victimisation means any action taken against you because you complained, unless a complaint is shown to be deliberately false or malicious.

            ### Help from outside the yacht

            - **Your flag state**: contact details are in your copy of the complaint procedure. A **port state** inspector can also take a complaint when the yacht is in port.
            - **ISWAN SeafarerHelp**: a **free, confidential, multilingual helpline for seafarers, 24 hours a day, 365 days a year**. Phone **+44 20 7323 2737**, WhatsApp **+44 7909 470732**, live chat or the ISWAN for Seafarers app: **iswan.org.uk/seafarerhelp**. They'll listen, and help you work out what to do.
            - **The ITF** (International Transport Workers' Federation): find the nearest ITF inspector in the **ITF Seafarers app** or at **itfseafarers.org**, or email **seafsupport@itf.org.uk**. If you're in a seafarers' union, contact them too.

            **If you've been assaulted or are in danger right now,** go to the Captain or the officer of the watch straight away and ask for medical help. You can also report a crime to the police in port. Your safety comes first.

            Follow your yacht's own policy and your SEA, too: many yachts and management companies have their own confidential reporting line.
          `),
          image("rb-07-complaint-route.png", "The on-board complaint procedure: where you can take a complaint"),
          order("The complaint route", "Put the usual steps of a complaint in order, starting with what you do first. (Remember: you can skip straight to the Captain, or outside, at any time.)", [
            "Write down what happened: when, where, who and what was said",
            "Talk to your Head of Department, or another officer you trust",
            "If it isn't sorted, take it to the Captain",
            "If it's still not settled, take it ashore to the company or DPA",
            "If you need to, go outside the yacht: the flag state, the ITF or a union",
          ]),
          quiz("If it happens to you", [
            ["single", "Your HoD is the person bullying you. What does the complaint procedure let you do?", ["Nothing until your contract ends", "You must still complain to your HoD first", "*Go straight to the Captain, or outside the yacht", "Only complain anonymously online"], "Complaints normally start at the lowest level, but you always have the right to go directly to the master, and to external authorities."],
            ["truefalse", "You can be given worse jobs or lose your tips for making a complaint, as long as nobody says that's the reason.", false, "Any action taken against you because you complained is victimisation, and the MLC prohibits it. Note what happens and report it."],
            ["multi", "Which of these can help you if you're being harassed? Choose all that apply.", ["*Notes of dates, times, what was said and who saw it", "*ISWAN SeafarerHelp, free and confidential, 24/7", "*The person named in the complaint procedure for confidential advice", "Posting about it on social media to shame them", "*Bringing a crewmate with you to a meeting about it"], "Notes, confidential advice, outside helplines and support from a crewmate all help. Posting about it publicly can make things harder for you."],
          ]),
        ]),
        lesson("If you see it happen", [
          reading(`
            Harassment and bullying carry on when everyone else stays quiet. The ICS/ITF guidance asks every seafarer to support crewmates who are being harassed or bullied, and to report what they see. You don't have to be a hero, and you should **never put yourself in danger**. There are safe ways to help:

            - **Interrupt.** Change the subject, or call the person away: "Can you give me a hand on the aft deck?"
            - **Say something short and calm**, if it's safe: "Leave it. It's not funny any more."
            - **Get help.** Tell your HoD, an officer or the Captain what you saw. If it's an emergency, go to the officer of the watch.
            - **Check in afterwards.** "Are you OK? Do you want to talk?" Being believed and supported makes a huge difference.
            - **Write down what you saw**, and offer to be a witness.
            - **Don't film it, share it or gossip about it.** That makes things worse for the person it's happening to.

            If someone tells you it's happening to them: **listen, believe them, don't judge**, and help them find the right person to tell. Don't take over or report it behind their back unless someone is in danger. Help them decide.
          `),
          match("Safe ways to help", "Match what you see with a safe way to help.", [
            ["A crewmate is being cornered by someone at a crew party", "Go over and give them a reason to leave with you"],
            ["A mocking photo of a crewmate is posted in the crew chat", "Don't react or share it; tell your HoD and check on them"],
            ["A crewmate tells you they're being harassed", "Listen, believe them and help them find the right person to tell"],
            ["A joke about someone's religion gets a laugh at dinner", "Calmly say it's not OK, if it's safe to"],
            ["You saw a crewmate being belittled on deck", "Write down what you saw and offer to be a witness"],
          ]),
          quiz("Being a good bystander", [
            ["truefalse", "If it isn't happening to you, it's best to stay out of it.", false, "Silence lets it carry on. You can help safely: interrupt, check in, get help, offer to be a witness."],
            ["single", "Which is the safest first thing to do if you see a crewmate being cornered at a crew party?", ["Film it as evidence", "Wait to see if it gets worse", "*Go over and give them a reason to leave with you, and get help if needed", "Post about it in the crew chat"], "Interrupting quietly gets them out of the situation. Filming or posting can make things worse for them."],
          ]),
        ]),
      ]),

      section("For HoDs and officers", [
        lesson("When someone comes to you", [
          reading(`
            If you're a Head of Department or an officer, you're often the first person someone tells, usually after a lot of worrying about whether to. How you react decides whether they, and everyone watching, will ever speak up again.

            **1. Listen.** Find somewhere private. Let them talk; don't interrupt, judge or play it down. Ask if they'd prefer to talk to someone else, for example someone of a particular gender, or with a crewmate present.

            **2. Take it seriously.** Thank them for telling you. Never "it's just banter", "they didn't mean it" or "you'll have to toughen up". People rarely complain unless they feel seriously wronged.

            **3. Keep it confidential, as far as possible.** Don't promise that nobody else will ever know: tell them who will need to know, and why. Then share it only with those people.

            **4. Write it down.** The facts, dates, places, witnesses and their own words. Agree the note with them; the procedure says complaints and decisions are recorded and they get a copy.

            **5. Escalate, don't investigate alone.** Take it to the Captain, or ashore to the company or DPA, as your yacht's procedure says. Don't confront the accused yourself, and don't try to settle it quietly. An investigation must be fair and objective, and the person accused has the right to give their side too.

            **6. Protect them from victimisation.** Watch for worse jobs, being left out, cut tips or "jokes" about them complaining, and act on them. If people have to be separated, the guidance is to move the person accused, not the person who complained, unless that's what they want.

            **If someone is in danger, has been assaulted, or a crime may have happened,** tell the Captain immediately and make sure they get medical care.

            ### Your own behaviour

            Your crew takes its lead from you. Watch how you give feedback (in private, about the work, never about the person), how you share out jobs, time off and tips, and what you laugh at. If you hear yourself say "it's only banter", stop and check.
          `),
          image("rb-08-when-someone-comes.png", "For HoDs and officers: when someone comes to you"),
          sort("Do or don't?", "A deckhand tells you a crewmate has been making sexual comments to them. Sort these responses.", ["Do", "Don't"], [
            ["Find a private place and listen without interrupting", 0],
            ["Tell them it was probably just banter", 1],
            ["Write down the facts and agree the note with them", 0],
            ["Confront the crewmate yourself to sort it out quickly", 1],
            ["Promise them nobody else will ever know", 1],
            ["Tell them who will need to know, and why", 0],
            ["Take it to the Captain or the company/DPA, as the procedure says", 0],
            ["Move the deckhand to another department to keep the peace", 1],
          ]),
          quiz("When someone comes to you", [
            ["single", "A junior crew member tells you a senior officer keeps touching their arm and back. What do you do?", ["Speak to the officer quietly and ask them to stop, then forget about it", "*Listen, take notes, and escalate to the Captain or company/DPA under the procedure, keeping it as confidential as you can", "Tell them it's probably cultural and to ignore it", "Wait to see if anyone else complains"], "Take it seriously, record it, and escalate. Don't try to settle it alone, especially when the accused is senior."],
            ["truefalse", "Moving the person who complained to another department is a good way to resolve a harassment complaint.", false, "That punishes the person who spoke up. If people need to be separated, the guidance is to move the person accused, unless the person who complained asks to move."],
            ["single", "What should you say about confidentiality?", ["\"Nobody will ever know.\"", "*\"I'll keep this as private as I can. I'll need to tell the Captain, and here's why.\"", "\"I can't keep anything private.\"", "Nothing: just get on with it"], "Be honest. Promise confidentiality as far as possible, and say who will need to know."],
          ]),
        ]),
      ]),

      section("A respectful crew", [
        lesson("Living and working together", [
          reading(`
            As the ICS/ITF guidance puts it, the yacht is your crewmates' home for a long time, so everyone needs to respect one another, recognise different cultures and ways of doing things, and welcome diversity. Sometimes that means changing how you behave so you don't upset someone without meaning to.

            ### Many nationalities, one crew

            - Use the yacht's **working language** at work and when others are around, so nobody is left out. Speaking your own language with friends off duty is fine.
            - No nicknames, jokes or impressions based on someone's nationality, accent, religion, skin colour or gender.
            - Respect differences in food, prayer, fasting and holidays. Ask, don't assume.
            - Treat everyone the same when it comes to jobs, time off and tips.

            ### Rotations and new crew

            - Welcome new and rotating crew: show them around, include them, explain how things work.
            - Don't let "the old crew" and "the new crew" become two camps.
            - Hand over properly. Leaving someone to fail is a form of bullying too.

            ### Shared cabins

            - Respect your cabin-mate's **sleep and rest hours**: their rest is protected by the MLC as much as yours. Keep lights, calls and alarms low when they're off watch.
            - Keep it tidy, ask before borrowing, and follow the yacht's rules on visitors.
            - If it isn't working, talk about it calmly early on, or ask your HoD for help.

            ### Social media

            - **Don't post photos or videos of crewmates without asking**, and never anything mocking or embarrassing.
            - What you say about crewmates online, in public or in private chats, counts as much as what you say on board.
            - Follow your yacht's social media and privacy policy, especially about guests, owners and the yacht's location.

            **A respectful crew is a safer crew.** People who feel respected speak up about mistakes and hazards, look out for each other, and stay longer.
          `),
          quiz("A respectful crew", [
            ["single", "Your cabin-mate is off watch and asleep at 14:00. You want to call home. What's the respectful thing to do?", ["*Make the call somewhere else, such as the crew mess or on deck", "Call quietly from your bunk", "Wake them to ask if it's OK", "Put them on speaker so they can say hello"], "Their rest hours are protected too. Take calls, lights and noise elsewhere when your cabin-mate is resting."],
            ["truefalse", "It's fine to post a funny video of a crewmate on your own social media as long as you don't tag them.", false, "Ask first, every time. Posting someone without their consent, especially something embarrassing, can be harassment."],
            ["single", "Three crew members speak their own language at work in front of a new crewmate who doesn't understand it. What's the best approach?", ["Nothing: it's their language", "*Use the yacht's working language when others are around at work, so nobody is left out", "The new crewmate should learn the language", "Ban all other languages on board"], "Speaking your own language off duty is fine. At work and in shared spaces, the working language keeps everyone included and safe."],
          ]),
        ]),
        lesson("Final check", [
          quiz("Final quiz", [
            ["single", "Under the minimum-rest system, what's the least rest you must have?", ["8 hours in any 24 hours and 70 in any 7 days", "*10 hours in any 24 hours and 77 in any 7 days", "12 hours in any 24 hours and 84 in any 7 days", "6 hours in any 24 hours, as long as the week adds up"], "10 in any 24, 77 in any 7, in no more than two periods, one of at least 6 hours."],
            ["truefalse", "You must be given the chance to read your SEA and get advice before you sign it.", true, "Standard A2.1. Never let yourself be rushed, and keep a signed copy."],
            ["single", "Which statement about harassment is right?", ["It only counts if it was intended", "It only counts if it happens on duty", "*It's about the effect on the person, and it can happen in a group chat or off duty too", "It only counts if there's a witness"], "Harassment is unwelcome behaviour that makes someone feel uneasy, humiliated, embarrassed or uncomfortable, whether intended or not, on board, ashore or online."],
            ["single", "Your HoD is the one harassing you. Who can you complain to?", ["Only your HoD", "Nobody until you leave the yacht", "*The Captain directly, or outside the yacht, for example the flag state or the ITF", "Only a lawyer"], "You always have the right to complain directly to the master and to appropriate external authorities."],
            ["multi", "Which of these are victimisation for making a complaint? Choose all that apply.", ["*Being given the worst jobs because you complained", "*Losing tips or your reference because you complained", "Being asked to explain what happened in a private meeting", "*Being moved to another department against your wishes because you complained"], "Any action against you because you complained is victimisation, and the MLC says it must be prohibited. Being asked about what happened is part of a fair process."],
            ["single", "ISWAN SeafarerHelp is…", ["A paid legal service for officers", "*A free, confidential, multilingual helpline for seafarers, 24 hours a day, 365 days a year", "The flag state's complaint office", "A crew recruitment agency"], "Contact them by phone, WhatsApp, live chat or the ISWAN for Seafarers app: iswan.org.uk/seafarerhelp."],
            ["truefalse", "As an officer, if a crew member tells you about harassment, you should promise them that nobody else will ever know.", false, "Promise confidentiality as far as possible, and be honest about who will need to know, for example the Captain."],
            ["single", "You see a crewmate being mocked in the crew chat, and they've gone quiet. What's a good thing to do?", ["Add a laughing emoji so they know it's only a joke", "Forward it to other crew to ask if it's OK", "*Don't add to it; tell your HoD and check in with the person privately", "Leave the group"], "Don't react or spread it. Get help and support the person it's aimed at."],
          ]),
          ack("I have completed this course. I know my basic rights under the MLC and my SEA, including my hours of rest, and how to use the on-board complaint procedure. I will treat every crewmate with respect, on board, ashore and online; I will not harass or bully anyone; I will support crewmates and speak up or report it when I see harassment or bullying; and if I am an HoD or officer, I will listen, record, escalate and protect anyone who comes to me."),
        ]),
      ]),
    ],
  };
}

export const buildCourse = makeBuild(content);

export const MEDIA_FILES = [
  "rb-01-cover.png", "rb-02-your-rights.png", "rb-03-rest-rules.png", "rb-04-rest-record.png",
  "rb-05-the-line.png", "rb-06-group-chat.png", "rb-07-complaint-route.png", "rb-08-when-someone-comes.png",
  "rb-a1-rest-hours.mp4", "rb-a2-banter-to-bullying.mp4",
];
