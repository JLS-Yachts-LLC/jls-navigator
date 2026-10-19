// "Wellbeing at sea — fatigue, health and getting help" — JLS library course for every
// crew member, in the Crew Academy content shape (src/lib/academy/content.ts). Files are
// referenced by name ("@wb-01-cover.png") and swapped for academy_media ids by
// buildCourse(mediaIds) once uploaded.
//
// Awareness, not medical advice. Content checked on 19 October 2026 against:
// - IMO MSC.1/Circ.1598, Guidelines on Fatigue (24 January 2019): the definition of fatigue
//   (annex para 1, "affects everyone regardless of skill" para 2); main causes (para 8);
//   window of circadian low typically 03:00–05:00 (para 27); maritime incidents with fatigue
//   as a cause mainly between midnight and 06:00 (para 28); post-lunch dip 15:00–17:00
//   (para 29); effects on decision-making, response time and hand–eye co-ordination, people
//   are poor judges of their own fatigue, microsleeps (paras 42–44); cognitive / physical /
//   behavioural signs (para 45, Table 1); alcohol impairs sleep quality, sedating
//   prescription drugs, caffeine halves every 5–6 hours (Module 1); for the seafarer: dark,
//   quiet, cool sleeping place, limit blue-light screens before bed, no caffeine for at
//   least four hours before bed, naps of about 20 minutes, naps over 30 minutes cause sleep
//   inertia, report fatigue in yourself and others (Module 3).
// - Dawson D. & Reid K. (1997) "Fatigue, alcohol and performance impairment", Nature 388:235:
//   after 17 hours awake, performance on a hand–eye (psychomotor) test fell to about the
//   level seen at 0.05% blood alcohol. Presented as one study's finding, nothing more.
// - STCW Code Section A-VIII/1 para 10 (2010 Manila amendments): flag states set a limit of
//   not more than 0.05% blood alcohol or 0.25 mg/l alcohol in the breath for masters,
//   officers and other seafarers performing designated safety, security and marine
//   environmental duties. Checked via the UK MCA's MGN 590 (M+F) Amendment 2 (July 2024),
//   which also recommends a written drug and alcohol policy and no alcohol in the four hours
//   before a watch, and flag circulars quoting A-VIII/1.10 (e.g. Cook Islands MCI 052).
// - Hours of rest: MLC 2006 Standard A2.3 paras 5–6 and STCW A-VIII/1 — at least 10 hours in
//   any 24 and 77 in any 7 days (ILO MLC FAQ C2.3.b). Covered in depth in another course.
// - NHS "Heat exhaustion and heatstroke" (nhs.uk): signs of each, cool / fluids / fan, should
//   feel better within 30 minutes, heatstroke is a medical emergency.
// - WHO fact sheet "Climate change, heat and health": outdoor workers at risk, drink water
//   regularly, stay in the shade, avoid hard work in the hottest part of the day.
// - UAE MoHRE midday break for outdoor work in direct sun, 12:30–15:00, 15 June–15 September
//   (2026 dates as reported by Khaleej Times / Gulf News from the MoHRE announcement).
// - "The morning after": only time removes alcohol from the blood (Oxfordshire Fire & Rescue
//   Service "Morning after" leaflet).
// - ISWAN (iswan.org.uk), checked 19 October 2026: YachtCrewHelp — free, confidential,
//   multilingual, 24 hours, 365 days; phone +44 20 3713 7273, WhatsApp +44 7514 500153,
//   live chat, email, call-back, ISWAN for Seafarers app. SeafarerHelp — same service for
//   all seafarers; phone +44 20 7323 2737, WhatsApp, live chat, email, call-back, app.
// - Samaritans "Myths about suicide": asking directly about suicide can protect someone.
// - Samaritans media guidelines / "10 top tips for reporting suicide": no method detail,
//   no suggestion it is a solution, no sensational language, always signpost support.
import { reading, image, video, ack, quiz, hotspot, match, order, sort, lesson, section, makeBuild } from "../blocks.mjs";
import { CABIN_SPOTS, DECK_SPOTS } from "./pictures.mjs";

export const COURSE = {
  title: "Wellbeing at sea — fatigue, health and getting help",
  category: "Health and wellbeing",
  minutes: 35,
  passMark: 80,
  refreshMonths: 12,
  summary:
    "For every crew member. Spot fatigue in yourself and your crewmates and know when to speak up, sleep better in a crew cabin, stay safe in the Gulf heat, understand the alcohol and medicine rules for being fit for duty, look after your mental health, support a crewmate who's struggling, and know where to get free, confidential help, 24 hours a day.",
};

export function content() {
  return {
    sections: [
      section("Looking after yourself on board", [
        lesson("Why wellbeing matters at sea", [
          image("wb-01-cover.png", "Wellbeing at sea"),
          reading(`
            Yacht life can be brilliant: travel, a close team, good money, beautiful places. It can also be hard on your body and mind. Long charter days, broken sleep, heat, living and working with the same people, and being far from home all add up.

            How you feel isn't only your own business on a yacht. A tired, unwell or overwhelmed crew member is more likely to get hurt, or to make a mistake that hurts someone else. Looking after yourself, and looking out for each other, is part of working safely.

            ### In this course

            - **Fatigue:** why yacht crew get tired, how to spot it, your body clock, sleeping in a crew cabin, and how to tell your Head of Department (HoD) you're too tired to do a job safely.
            - **Heat:** working outside in the Gulf summer, and the difference between heat exhaustion and heatstroke.
            - **Alcohol, drugs and medicines:** being fit for duty, the rules, and "the morning after".
            - **Mental health:** stress, loneliness and low mood, and how to support a crewmate.
            - **Getting help:** on board, and the free, confidential helplines for crew.

            > This course is about awareness. It isn't medical advice. If you're worried about your health, speak to the Captain, the medical officer or a doctor.
          `),
          quiz("Check your understanding", [
            ["single", "Why does your wellbeing matter to the rest of the crew?", ["It doesn't: it's a private matter", "*Tired, unwell or overwhelmed crew are more likely to have accidents or make mistakes that affect others", "Only because the Captain has to fill in a report", "Only on charter, when guests are on board"], "On a yacht everyone depends on everyone else. Looking after yourself is part of working safely."],
            ["truefalse", "This course replaces advice from a doctor or the yacht's medical officer.", false, "It's awareness only. For your own health, always talk to the Captain, the medical officer or a doctor."],
          ]),
        ]),
      ]),

      section("Fatigue", [
        lesson("What fatigue is, and why it's a safety issue", [
          reading(`
            The IMO's *Guidelines on Fatigue* (MSC.1/Circ.1598, 2019) describe fatigue as a state of physical or mental impairment, caused by things like too little sleep, being awake too long, working against your body clock, and hard physical, mental or emotional work. It reduces your alertness and your ability to do safety jobs.

            The guidelines are clear that **fatigue affects everyone**, however skilled or experienced they are. The main causes are:

            - not enough sleep, or poor-quality sleep;
            - working or sleeping at the wrong time for your body clock;
            - staying awake for a long time;
            - stress;
            - too much work, physical or mental.

            On a yacht that looks like this:
          `),
          image("wb-02-fatigue-causes.png", "Why yacht crew get tired: it usually isn't one thing, but several adding up over days"),
          reading(`
            ### Why it matters

            Fatigue slows your reactions and harms your judgement, memory, decision-making and hand–eye co-ordination. Tired people miss steps in a routine, take short cuts and choose riskier ways of working because they take less effort. At worst you can have a **microsleep**: a few seconds asleep without knowing it, with your eyes open. Think of that while driving the tender, on lookout or handling lines.

            In a well-known study (Dawson and Reid, 1997), after **17 hours awake** people's performance on a hand–eye co-ordination test dropped to about the level seen at **0.05% blood alcohol**. If you got up at 06:00, that's 23:00 the same day.

            ### The signs

            The IMO guidelines group the signs of fatigue into three kinds. Watch for them in yourself **and** in others, because **people are poor judges of how tired they are**.

            - **In your head:** can't concentrate, forgetting steps, slow to respond, misjudging distance or speed, finding simple problems hard.
            - **In your body:** yawning, heavy or droopy eyelids, nodding off, clumsiness and dropping things, headaches, slurred or slow speech.
            - **In your behaviour:** quieter than usual, irritable, a "don't care" attitude, taking risks, skipping checks.
          `),
          quiz("Fatigue", [
            ["multi", "Which of these are signs of fatigue? Choose all that apply.", ["*Forgetting a step in a routine job", "*Being unusually irritable with crewmates", "*Dropping tools or glasses", "Feeling hungry at lunchtime", "*Misjudging the distance when coming alongside"], "Fatigue shows in your head, your body and your behaviour. Hunger at lunchtime is just lunchtime."],
            ["truefalse", "Experienced crew who are used to long hours don't really get fatigued.", false, "Fatigue affects everyone, whatever their skill or experience. Experience can make you better at hiding it, not immune to it."],
            ["single", "What is a microsleep?", ["A planned 20-minute nap", "*A few seconds of sleep you may not notice, sometimes with your eyes open", "Sleeping in short blocks between watches", "Dozing off during a film in the crew mess"], "Microsleeps are especially dangerous on lookout, at the helm or driving the tender. They're more likely when you're short of sleep and working through the night."],
          ]),
        ]),
        lesson("Your body clock and rest hours", [
          video("wb-a1-body-clock.mp4", "Animation: your body clock"),
          reading(`
            Your body clock (your circadian rhythm) makes you sleepy or alert on a regular 24-hour cycle, **whether you're working or not**. According to the IMO guidelines:

            - Alertness is **lowest in the early hours, typically between about 03:00 and 05:00**. Studies of accidents at sea found that incidents where fatigue played a part happened mainly **between midnight and 06:00**.
            - There's a second, smaller **dip in the afternoon, roughly 15:00 to 17:00** (the "post-lunch dip").
            - Being short of sleep and working at a low point make each other worse.

            Your body clock adjusts slowly, by only an hour or two a day. That's why jet lag after a long flight to join the yacht, and switching between day work and night watches, can leave you tired for days.

            ### Rest hours

            The rules on hours of rest (the Maritime Labour Convention and STCW) are there to protect you from fatigue. In short: **at least 10 hours of rest in any 24 hours, and 77 hours in any 7 days.** Another course covers the details. Record your hours honestly: the records only protect you if they're true.

            ### "I'm too tired to do this safely"

            If you're too tired to do a job safely, **say so before you start**: to your Head of Department, the OOW or the Captain. Reporting fatigue in yourself or others is exactly what the IMO guidelines ask crew to do. Saying it early lets your HoD swap tasks, add a second person or give you a break. A good HoD would much rather hear "I'm not safe on the tender right now" than deal with an accident.
          `),
          quiz("Body clock and rest", [
            ["single", "According to the IMO guidelines, when is your body clock usually at its lowest point?", ["Straight after lunch", "Around 22:00", "*In the early hours, typically about 03:00 to 05:00", "Mid-morning"], "The 'window of circadian low' is typically 03:00 to 05:00. There's a smaller dip around 15:00 to 17:00."],
            ["single", "You're on the 00:00–04:00 watch tonight. What will help most?", ["Drinking energy drinks all evening", "*Getting a proper sleep before the watch and using your breaks", "Staying up so you're 'tired enough' to sleep after", "Nothing: experienced crew don't need to prepare"], "Get sleep in before a night watch, and use breaks. You'll be working through your body clock's low point."],
            ["truefalse", "If you're too tired to do a job safely, the right time to tell your HoD is before you start it.", true, "Speak up early, so the job can be changed, shared or moved. That's what a safe team wants."],
          ]),
        ]),
        lesson("Sleeping well in a crew cabin", [
          reading(`
            Crew cabins are small, often shared, and close to engines, generators and busy corridors. Here's how to get the best sleep out of them. These tips come from the IMO guidelines:

            - **Dark:** block out as much light as you can, with blackout curtains or a porthole cover. An eye mask helps, especially for day sleep after a night watch.
            - **Quiet:** earplugs or a white-noise app. Agree "quiet hours" with your cabin mate if your shifts are different.
            - **Cool:** a cool, comfortable cabin helps you sleep. Ask about the air conditioning if it isn't working.
            - **Screens:** put the phone down before bed. Scrolling keeps your brain busy and the light from screens makes it harder to fall asleep.
            - **Caffeine:** coffee, tea, cola, energy drinks and some chocolate and cold remedies all contain it. Caffeine levels only halve every five to six hours, so **no caffeine for at least four hours before you plan to sleep**.
            - **Alcohol** may make you feel drowsy, but it spoils the quality of your sleep.
            - **Don't eat a heavy meal** right before you sleep.

            ### Naps

            A short nap is one of the best ways to boost your alertness. **About 20 minutes is best.** Naps of more than 30 minutes can leave you groggy and confused for up to 20 minutes after you wake (this is called sleep inertia), so allow time to wake up properly before a safety job. If you struggle to sleep at your normal time, skip the nap.
          `),
          hotspot("Why can't Ayo sleep?", "It's 14:00. Ayo has the night watch tonight and is trying to sleep. Tap one thing in the cabin that is keeping Ayo awake.", "wb-03-cabin.png", CABIN_SPOTS),
          sort("Helps or spoils your sleep?", "Put each one in the right group.", ["Helps you sleep", "Spoils your sleep"], [
            ["An eye mask or a blackout curtain on the porthole", 0],
            ["Earplugs when your cabin mate is on a different shift", 0],
            ["A cool cabin", 0],
            ["Last coffee at least four hours before you sleep", 0],
            ["Phone on do-not-disturb and out of reach", 0],
            ["An energy drink at the end of your shift", 1],
            ["Scrolling social media in bed", 1],
            ["A couple of drinks to help you nod off", 1],
            ["A big, heavy meal right before bed", 1],
            ["A bright reading light left on", 1],
          ]),
          quiz("Sleep and naps", [
            ["single", "How long is the most effective nap, according to the IMO guidelines?", ["5 minutes", "*About 20 minutes", "About 1 hour", "As long as you can get"], "About 20 minutes. Over 30 minutes and you risk waking groggy (sleep inertia)."],
            ["truefalse", "A drink before bed improves the quality of your sleep.", false, "Alcohol can make you drowsy, but it spoils the quality of your sleep and can leave you less alert the next day."],
          ]),
        ]),
      ]),

      section("Heat", [
        lesson("Working in the Gulf heat", [
          reading(`
            In a Gulf summer, the deck, the tender and the engine room can all get dangerously hot. Your body cools itself by sweating, and in heat and humidity it can't keep up. You lose water and salt fast, often before you feel thirsty.

            ### Heat exhaustion and heatstroke

            **Heat exhaustion** is your body struggling with the heat. If you deal with it quickly it isn't usually serious.

            **Heatstroke** is when the body can no longer cool itself. **Heatstroke is a medical emergency.** It can kill.
          `),
          image("wb-04-heat-illness.png", "Heat exhaustion or heatstroke: what to look for and what to do (from NHS guidance)"),
          reading(`
            ### If someone has heat exhaustion

            1. Get them into the shade or a cool, air-conditioned space.
            2. Take off any extra clothing.
            3. Give them plenty of water, or a sports or rehydration drink.
            4. Cool their skin: spray or sponge with cool water and fan them. Cold packs wrapped in a cloth on the neck or armpits help.
            5. Stay with them. They should start to feel better **within about 30 minutes**.

            If they're not better after 30 minutes, or they show **any** sign of heatstroke (hot skin that has stopped sweating, confusion, a fit, collapsing), **treat it as an emergency**: raise the alarm, tell the Captain or medical officer at once and get medical help. Keep cooling them while you wait.

            ### Prevention: water, shade, breaks, buddies

            - **Drink water regularly** through the shift, not just when you're thirsty. Keep a bottle with you.
            - **Shade and breaks:** plan the hardest work for the cooler parts of the day, and take breaks in the shade or inside. Ashore in the UAE, outdoor work in direct sun is banned from 12:30 to 15:00 between 15 June and 15 September. That's a good guide for planning deck work too.
            - **Cover up:** a hat, sunglasses, loose light-coloured clothing and sunscreen.
            - **Buddy checks:** look at each other. Someone who's red-faced, confused, or has stopped sweating needs help now, even if they say they're fine.
            - **Take it easier at first:** if you've just arrived from a cooler country, your body needs time to get used to the heat.
            - **Go easy on alcohol:** NHS heat advice is to limit it, and a hangover leaves you already short of water.
          `),
          hotspot("Who needs help?", "It's a hot afternoon on the aft deck. Tap the crew member who is showing signs of heat illness.", "wb-05-deck-heat.png", DECK_SPOTS),
          quiz("Heat", [
            ["single", "A deckhand is hot, confused and has stopped sweating. What is it, and what do you do?", ["Heat exhaustion: give them a drink and carry on", "*Possible heatstroke: a medical emergency. Raise the alarm, get medical help and keep cooling them", "Tiredness: send them to bed", "Sunburn: give them sunscreen"], "Hot skin that isn't sweating, plus confusion, are signs of heatstroke. Treat it as an emergency."],
            ["truefalse", "Someone with heat exhaustion who has been cooled and given fluids should start to feel better within about 30 minutes.", true, "If they don't, or any heatstroke signs appear, treat it as an emergency."],
            ["multi", "Which of these help prevent heat illness on deck? Choose all that apply.", ["*Drinking water regularly through the shift", "*Breaks in the shade", "*Keeping an eye on each other", "Saving the hardest jobs for midday", "*A hat and loose, light clothing"], "Water, shade, breaks, cover-up and buddy checks. Do the hardest work in the cooler parts of the day."],
          ]),
        ]),
      ]),

      section("Alcohol, drugs and medicines", [
        lesson("Fit for duty", [
          reading(`
            Every yacht has its own **drug and alcohol policy**, and it's part of your employment. **Read it, and follow your yacht's own policy**: it's the one that applies to you.

            ### The rules

            - Under the **STCW Code (Section A-VIII/1)**, the limit for anyone doing safety, security or environmental duties is **no more than 0.05% blood alcohol or 0.25 mg/l alcohol in the breath**. Each flag state puts this into its own law.
            - Many yachts set **stricter limits, or zero**, for anyone on duty, on watch or driving a tender, and many ban alcohol for a set time before a watch.
            - Many yachts do **random drug and alcohol testing**, as well as testing after an accident. Check what your policy says, including about refusing a test.
            - **Illegal drugs: never.** Being found with them can end your career, and in many countries, the UAE included, the penalties are severe.

            ### The morning after

            If you were drinking late, you may still be over the limit the next morning. **Coffee, a cold shower or a big breakfast don't remove alcohol from your blood: only time does**, and how long it takes varies from person to person. The IMO guidelines add that alcohol can leave you less alert even after it can no longer be detected. If you're not sure you're fit, you're not: tell your HoD.

            ### Medicines

            Some medicines, including some hay-fever tablets, sleeping tablets, strong painkillers, seasickness tablets and cold remedies, can make you drowsy or slow your reactions, especially with alcohol or when you're tired.

            - **Tell the Captain or the medical officer** about any medicine that might affect your work, before you go on duty. They'll treat it with care and keep it as private as they can.
            - Read the leaflet, and ask a pharmacist or doctor whether it's safe to work or drive on it.
            - Don't take someone else's prescription medicine, and don't share yours.
          `),
          image("wb-06-fit-for-duty.png", "Fit for duty? Four checks before every watch or shift"),
          quiz("Fit for duty", [
            ["single", "What is the STCW alcohol limit for seafarers doing safety, security or environmental duties?", ["0.08% blood alcohol", "*0.05% blood alcohol (0.25 mg/l in the breath)", "0.02% blood alcohol", "There is no international limit"], "STCW Section A-VIII/1 sets a maximum of 0.05% blood alcohol or 0.25 mg/l in the breath. Many yachts set a stricter limit, or zero."],
            ["single", "Your yacht's policy is stricter than the STCW limit. Which one do you follow?", ["The STCW limit, because it's international law", "Whichever you prefer", "*Your yacht's own policy", "Neither, if you're off watch"], "Follow your yacht's own policy. It can be stricter than the law, and it's part of your contract."],
            ["truefalse", "A strong coffee and a cold shower will clear last night's alcohol before your morning shift.", false, "Only time removes alcohol from your blood. If you're unsure you're fit for duty, tell your HoD."],
            ["single", "The doctor ashore gives you tablets that say 'may cause drowsiness'. What should you do?", ["Take them and say nothing: it's private", "Stop taking them so you can work", "*Tell the Captain or medical officer before your next duty", "Take half the dose"], "They need to know so they can keep you, and everyone else, safe. Don't stop prescribed medicine without medical advice."],
          ]),
        ]),
      ]),

      section("Mental health and getting help", [
        lesson("Stress, loneliness and low mood", [
          reading(`
            Living and working in the same small space, far from family and friends, with long hours and little privacy, is hard on anyone's mind. **Stress, loneliness, homesickness, burnout and low mood are common at sea. They're nothing to be ashamed of**, and they're not a weakness. They can happen to the most experienced crew member on board.

            ### Signs in yourself

            - You can't switch off, or you can't sleep even when you have the chance.
            - You feel flat, tearful, irritable or numb, and it isn't passing.
            - You've stopped enjoying things you used to enjoy, or you're avoiding people.
            - You're drinking more, eating much more or less, or always exhausted.
            - You feel that you can't cope, or that things won't get better.

            If you notice these in yourself, **talk to someone**: a crewmate you trust, your HoD, the Captain, or a helpline. You don't need to wait until it's serious.

            ### Looking after yourself
          `),
          image("wb-07-look-after-yourself.png", "Small habits that protect your wellbeing on board"),
          reading(`
            - **Sleep:** protect it. Everything else is harder without it.
            - **Food and water:** regular meals, even on busy charter days. Keep water with you.
            - **Move:** a run ashore, a swim, the gym, stretching in your cabin.
            - **Stay in touch:** regular calls with family and friends, even short ones.
            - **Time off the boat:** use your time off to get off the boat when you can.
            - **Go easy on social media:** other people's highlights aren't real life. Comparing yourself can make you feel worse.
          `),
          quiz("Stress and low mood", [
            ["truefalse", "Feeling homesick or low on a long season means you're not cut out for yacht life.", false, "It's common and it's nothing to be ashamed of. Talking about it early helps."],
            ["multi", "Which of these can be signs that you're struggling? Choose all that apply.", ["*Not being able to sleep even when you have the chance", "*Avoiding people you usually get on with", "*Drinking more than usual", "Looking forward to your next leave", "*Feeling that things won't get better"], "Looking forward to leave is normal. The others, especially if they last, are a reason to talk to someone."],
          ]),
        ]),
        lesson("Supporting a crewmate", [
          video("wb-a2-notice-ask-listen.mp4", "Animation: notice, ask, listen"),
          reading(`
            You don't need to be an expert to help a crewmate who's struggling. You just need to notice, care and point them towards support.

            1. **Notice.** Changes over days: quieter, withdrawn, skipping meals, irritable, drinking more, not themselves.
            2. **Ask.** Find a quiet, private moment. "You've seemed a bit quiet lately. How are you doing?" If they say "fine", it's OK to ask again: "Are you sure? I'm happy to listen."
            3. **Listen without judging.** Let them talk. You don't have to fix it or have the answers. Don't tell them how they should feel.
            4. **Encourage help.** Suggest they talk to the Captain, their HoD, the medical officer or a helpline such as YachtCrewHelp. Offer to sit with them while they call.
            5. **Check in later.** A few days later, ask again. It shows you meant it.

            Look after yourself too. Supporting someone can be heavy, and you can talk to the Captain or a helpline about it as well, in confidence.

            ### If you're worried about someone's safety

            If someone talks about not wanting to live, or about ending their life, **take it seriously**. It's OK to ask them directly if they're thinking about suicide. Samaritans say the evidence shows asking won't put the idea in their head: it can protect them, and it can be a relief to be asked. Don't leave them alone if you think they're at risk, and get help.

            **If someone is in immediate danger, tell the Captain now, or call the emergency services.** Helplines such as YachtCrewHelp are there 24 hours a day, for them and for you.
          `),
          order("Supporting a crewmate", "Put the steps in the order you'd usually take them.", [
            "Notice that a crewmate has been quieter and withdrawn for a few days",
            "Find a quiet, private moment",
            "Ask how they're doing, and ask again if they say \"fine\"",
            "Listen without judging or trying to fix it",
            "Encourage them to talk to the Captain, the medical officer or a helpline",
            "Check in with them again a few days later",
          ]),
          quiz("Supporting a crewmate", [
            ["single", "A crewmate tells you they're struggling. What's the most helpful thing to do first?", ["Tell them everyone feels like that", "Give them advice on what to do", "*Listen, without judging or rushing to fix it", "Tell the rest of the crew so they can help"], "Listening comes first. Then encourage them towards support, and keep what they've told you private unless their safety is at risk."],
            ["truefalse", "Asking someone directly if they're thinking about suicide can put the idea into their head.", false, "Asking directly doesn't put the idea there, and it can be a relief. If someone is in immediate danger, tell the Captain or call the emergency services."],
          ]),
        ]),
        lesson("Where to get help", [
          reading(`
            ### On board

            - **The Captain, your Head of Department or the medical officer.** They'll treat what you tell them with care, and they'd much rather know early.
            - **A crewmate you trust.** Sometimes that first conversation is the hardest step.
            - **Your employee assistance programme (EAP)**, if your yacht or management company has one: usually free, confidential counselling by phone or video. Ask the Captain or check your contract.

            ### Off the yacht, any time

            **YachtCrewHelp** is run by the seafarers' charity **ISWAN** just for yacht crew. It's **free, confidential and open 24 hours a day, 365 days a year**, in English and many other languages. The helpline officers are trained in emotional support, and you choose what you share.

            - Phone: **+44 20 3713 7273**
            - WhatsApp: **+44 7514 500153**
            - Live chat, email or a call-back: **iswan.org.uk/yachtcrewhelp**

            **SeafarerHelp**, also run by ISWAN, is the same kind of 24-hour helpline for all seafarers: **+44 20 7323 2737**, or WhatsApp, live chat and email at **iswan.org.uk/seafarerhelp**. The free **ISWAN for Seafarers** app has all the ways to get in touch in one place.

            Calls to UK numbers may cost you money, depending on your phone plan. WhatsApp, live chat and a call-back request are other ways to get in touch.

            ### Ashore

            - **Your own doctor**, at home or a clinic when you're in port, for anything that's going on for a while.

            **If someone is in immediate danger, tell the Captain now, or call the emergency services.**

            *Contact details checked on ISWAN's own website on 19 October 2026.*
          `),
          image("wb-08-where-to-get-help.png", "Where to get help: save these numbers in your phone"),
          match("Who can help?", "Match each situation with the best place to get help.", [
            ["You feel too tired to drive the tender safely", "Your Head of Department, before the task"],
            ["You've been given tablets that may cause drowsiness", "The Captain or the medical officer"],
            ["You want to talk to someone outside the yacht, in confidence, at 03:00", "YachtCrewHelp: free, confidential, 24/7"],
            ["A crewmate has collapsed in the heat and is confused", "Raise the alarm and get medical help now"],
            ["You'd like a few sessions with a counsellor", "Your yacht's employee assistance programme, if it has one"],
            ["A health worry that's been going on for months", "Your own doctor"],
          ]),
          quiz("Getting help", [
            ["truefalse", "YachtCrewHelp is only for emergencies, so you shouldn't call about loneliness or stress.", false, "It's for any worry, big or small: emotional, wellbeing or practical. It's free, confidential and open 24/7."],
            ["single", "Who runs YachtCrewHelp?", ["Your yacht's management company", "*ISWAN, an international seafarers' welfare charity", "The flag state", "The yacht's insurer"], "YachtCrewHelp is run by ISWAN (the International Seafarers' Welfare and Assistance Network), independently of your employer."],
          ]),
        ]),
      ]),

      section("Final check", [
        lesson("Final quiz", [
          quiz("Final quiz", [
            ["single", "When is fatigue most likely to be at its worst, according to the IMO guidelines?", ["Mid-morning", "*In the early hours, about 03:00 to 05:00", "Early evening", "Straight after waking from a full night's sleep"], "The window of circadian low is typically 03:00 to 05:00, with a smaller dip around 15:00 to 17:00."],
            ["multi", "Which of these will help you sleep in a crew cabin? Choose all that apply.", ["*Blocking out light with a curtain or eye mask", "*Earplugs or white noise", "A late energy drink", "*No caffeine for at least four hours before sleep", "Scrolling until you feel sleepy"], "Dark, quiet, cool, and no caffeine or screens before bed."],
            ["truefalse", "People are good at judging how tired they are.", false, "People are poor judges of their own fatigue. That's why it matters to watch out for each other."],
            ["single", "Which is a sign of heatstroke rather than heat exhaustion?", ["Feeling thirsty", "Heavy sweating", "*Hot skin that has stopped sweating, with confusion", "A mild headache"], "Hot, dry skin, confusion, a fit or collapse are heatstroke signs. Heatstroke is a medical emergency."],
            ["single", "You were out late. You're due on the tender at 08:00 and you're not sure you're fit. What do you do?", ["Drink lots of coffee and go", "Go: you'll be fine once you're on the water", "*Tell your HoD you may not be fit for duty", "Ask a crewmate to cover without telling anyone"], "If you're not sure you're fit, you're not. Follow your yacht's policy and tell your HoD."],
            ["single", "A crewmate has been quiet and withdrawn for a week. What's a good first step?", ["Wait for them to come to you", "Mention it at the crew meeting", "*Find a private moment and ask how they're doing", "Tell them to cheer up"], "Notice, ask, listen. A private, caring question is often all it takes to open up."],
            ["single", "Which statement about YachtCrewHelp is correct?", ["It's only open in office hours", "It's paid for by the crew member", "*It's free, confidential and open 24 hours a day", "It reports calls to your employer"], "YachtCrewHelp, run by ISWAN, is free, confidential and open 24/7, by phone, WhatsApp, chat and email."],
            ["single", "Someone tells you they don't want to be alive any more and you think they're in immediate danger. What do you do?", ["Keep it secret, as they asked", "Tell them to sleep on it", "*Stay with them and tell the Captain now, or call the emergency services", "Send them a helpline number and leave them to it"], "Their safety comes first. Don't leave them alone. Get help straight away."],
          ]),
          ack("I have completed this course. I will look after my sleep and speak up when I'm too tired to work safely, watch out for heat illness in myself and others, follow my yacht's drug and alcohol policy and tell the Captain or medical officer about medicines that could affect my work, look out for my crewmates, and get help when I need it."),
        ]),
      ]),
    ],
  };
}

export const buildCourse = makeBuild(content);

export const MEDIA_FILES = [
  "wb-01-cover.png", "wb-02-fatigue-causes.png", "wb-03-cabin.png", "wb-04-heat-illness.png", "wb-05-deck-heat.png",
  "wb-06-fit-for-duty.png", "wb-07-look-after-yourself.png", "wb-08-where-to-get-help.png",
  "wb-a1-body-clock.mp4", "wb-a2-notice-ask-listen.mp4",
];
