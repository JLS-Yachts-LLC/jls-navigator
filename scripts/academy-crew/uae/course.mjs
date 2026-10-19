// "Living and working in the UAE — a guide for crew" — JLS library course, in the Crew
// Academy content shape (src/lib/academy/content.ts).
//
// General guidance only, not legal advice. Facts checked on 19 October 2026 against:
// - GOV.UK foreign travel advice, United Arab Emirates — "Safety and security" (local laws
//   and customs: drugs incl. traces in the blood and CBD, alcohol age 21 and Sharjah ban,
//   drinking in public, zero drink-driving, dress, affection in public, swearing and rude
//   gestures incl. online, photographing people and government/military sites, Ramadan,
//   jaywalking, staying at the scene of a crash, unpaid bills) and "Entry requirements"
//   (passport valid 6 months on arrival; residence-visa blood test; MOHAP approval before
//   travel for controlled medicines; visitors up to 3 months' supply, less for controlled).
// - GOV.UK "United Arab Emirates: prisoner pack" (right to contact the embassy, sworn Arabic
//   translator, don't sign documents you don't understand, passport can be held on bail).
// - UAE Embassy (uae-embassy.org) "Bringing medication into the UAE" (prescription for the
//   quantity carried; controlled medicines need MoH approval through the MOHAP website).
// - u.ae — "Handling emergencies" (999 police, 998 ambulance, 997 fire/Civil Defence,
//   996 coastguard) and "Residence visa for working in the UAE" (employer applies).
// - Dubai Police (dubaipolice.gov.ae) — 901 call centre for non-emergencies; dubai.ae
//   emergency numbers page (996 marine emergencies).
// - ICP / press reporting of ICP announcements (Gulf News, EY): since 2022 residence visas
//   are no longer stamped in passports; the Emirates ID card is the proof of residence,
//   the visa copy is in the UAEICP app. ICA: carry the card and show it when legally asked;
//   companies may not keep your Emirates ID.
// - UAE Public Prosecution statements (via WAM / Gulf News): Federal Decree-Law No. 34 of
//   2021 on Combating Rumours and Cybercrimes — Art. 43 insults online (imprisonment and/or
//   AED 250,000–500,000), Art. 44 privacy incl. photographing people without consent.
// - Federal Decree-Law No. 34 of 2023 (discrimination, hatred and extremism) — insulting
//   religions is a crime; insulting the state, its symbols and flag is a crime (Penal Code).
// - UAE working week: Saturday–Sunday weekend for the federal government from 1 Jan 2022.
// - MOHRE: 2026 midday break, no outdoor work in direct sun 12:30–15:00, 15 June–15 Sept.
// - NHS "Heat exhaustion and heatstroke" (signs, first aid, better within 30 minutes).
// - RTA (rta.ae / Dubai Media Office): foreign licences from listed countries can be
//   exchanged for a UAE licence; visitors use an IDP from their home country. RTA public
//   transport rules: no eating or drinking on metro/tram/bus, women-and-children and Gold
//   Class carriages, Nol card. Money: AED pegged to the US dollar; VAT 5% (since 2018).
// Deliberately left general (sources disagree or change often): exact medicine quantity
// limits, fines for smoking, metro and Emirates ID offences, drug-possession minimums,
// alcohol-licence rules for buying to drink at home, and the exact order of the medical
// test and biometrics.
import { reading, image, video, ack, quiz, hotspot, match, order, sort, lesson, section, makeBuild } from "../blocks.mjs";
import { SPOTS } from "./pictures.mjs";

export const COURSE = {
  title: "Living and working in the UAE — a guide for crew",
  category: "Crew life",
  minutes: 35,
  passMark: 80,
  refreshMonths: 24,
  summary:
    "For crew joining or based on a yacht in Dubai or Abu Dhabi. How your UAE visa works, the laws that catch visitors out (drugs, medicines, alcohol, swearing and insults online, photos of people), Ramadan and local customs, coping with the heat, and exactly what to do if something goes wrong.",
};

export function content() {
  return {
    sections: [
      section("Welcome to the UAE", [
        lesson("Before you start", [
          image("uae-01-cover.png", "Living and working in the UAE — a guide for crew"),
          reading(`
            The **United Arab Emirates (UAE)** is a country of seven emirates: Abu Dhabi (the capital), Dubai, Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah and Fujairah. Many yachts are based in the marinas of Dubai and Abu Dhabi, and crew from all over the world live and work here.

            It's a safe, modern and welcoming place. It is also a Muslim country with its own laws and customs, and some things that are normal or legal at home are **crimes** here. Being a visitor, or not knowing the rule, is not a defence. The penalties can be serious: fines, prison, and deportation with a ban on coming back.

            UAE law applies to you the whole time you are in the UAE, ashore and while your yacht is in a UAE marina or UAE waters. The yacht's own rules (drugs and alcohol policy, shore leave, social media) apply on top.

            This course covers:

            - **Arriving and your visa**: the usual steps, and the documents you must keep with you.
            - **The law and local customs**: drugs and medicines, alcohol, smoking, dress and behaviour, what you say online, photos, Ramadan and religion.
            - **Everyday life**: the heat, getting around, money and staying in touch.
            - **If something goes wrong**: emergency numbers, arrest, and a lost passport.

            > **Please read this.** This course is general guidance, **not legal advice**. UAE laws and rules change, and some depend on your nationality, your visa or the emirate you're in. Where something varies, we say so, and JLS will tell you what applies to you. **If you're not sure about something, ask JLS or the Captain before you do it.**
          `),
          quiz("Check your understanding", [
            ["truefalse", "If something is legal in your home country, it's fine in the UAE as long as you're only visiting.", false, "UAE law applies to everyone in the UAE, visitors included. Some things that are legal at home, like CBD products or swearing at another driver, are crimes here."],
            ["single", "You're not sure whether something is allowed in the UAE. What's the best thing to do?", ["Do what other crew do", "Check a travel forum", "*Ask JLS or the Captain before you do it", "Do it, and apologise if there's a problem"], "Rules change and some depend on your situation. JLS and the Captain can tell you what applies to you."],
          ]),
        ]),
      ]),

      section("Arriving and your visa", [
        lesson("Your visa, step by step", [
          reading(`
            **JLS arranges your UAE visa.** You don't apply yourself, but you do need to turn up to appointments and bring the right documents. The usual steps for a UAE employment residence visa are:

            1. **Entry permit.** JLS applies for an entry permit, which lets you enter the UAE to complete the visa. It's electronic. JLS sends it to you with a document called **Arrival Instructions**. (If you're already in the UAE on another visa, your status may be changed instead. JLS will tell you.)
            2. **Fly in.** Travel with your passport, the entry permit and the Arrival Instructions.
            3. **Medical fitness test.** At an approved government health centre. It usually means a blood test and a chest X-ray, to screen for certain infectious diseases.
            4. **Biometrics.** Your fingerprints and photo are taken at a service centre for your **Emirates ID**.
            5. **Residence visa and Emirates ID.** Your residence visa is issued. Since 2022 it is **no longer a sticker in your passport**: it's electronic and linked to your Emirates ID card, which is your proof that you live here. You can see a copy of the visa in the official **UAEICP** app.

            Steps 3 and 4 can come in either order, and timings vary between emirates, free zones and individual cases. **JLS books your appointments and will tell you what happens when.** If you can't make an appointment, tell JLS straight away. Don't just miss it.
          `),
          image("uae-02-visa-steps.png", "The usual steps to a UAE residence visa. JLS will tell you the order and timings for yours."),
          video("uae-a1-airport-to-emirates-id.mp4", "Animation: from the airport to your Emirates ID"),
          order("Put the visa steps in order", "Put these steps in the order they usually happen.", [
            "JLS applies for your entry permit",
            "You receive the entry permit and the Arrival Instructions",
            "You fly in with your passport, entry permit and Arrival Instructions",
            "Medical fitness test and biometrics, on the dates JLS books",
            "Your residence visa is issued, linked to your Emirates ID",
            "You collect your Emirates ID card and keep it with you",
          ]),
          quiz("Your visa", [
            ["single", "Where is your UAE residence visa today?", ["A sticker on a page of your passport", "*It's electronic and linked to your Emirates ID card", "A paper certificate you must carry", "On a card you collect from the airport"], "Since 2022 the visa isn't stamped in passports. Your Emirates ID is the proof, and you can see a copy in the UAEICP app."],
            ["truefalse", "The medical fitness test usually includes a blood test and a chest X-ray.", true, "That's the usual test at an approved centre. JLS books the appointment."],
            ["single", "You can't make your biometrics appointment because the yacht is at sea that day. What do you do?", ["Just go to the next one you can", "Nothing. They'll send a new date", "*Tell JLS straight away so they can rebook it", "Ask a crewmate to go for you"], "Missed appointments can hold up your visa. Tell JLS as soon as you know."],
          ]),
        ]),
        lesson("Passport, Emirates ID and your Arrival Instructions", [
          reading(`
            ### Your passport

            - The usual rule is that your passport must be **valid for at least six months when you arrive**. Check the expiry date before you travel.
            - Your residence visa is linked to your **passport number**. If you get a new passport, the visa has to be moved to it. **Tell JLS before you renew**, or as soon as you have the new one.
            - Keep your passport somewhere safe, and keep photos or copies of your passport, visa and Emirates ID on your phone.

            ### Your Emirates ID

            - Once you have it, **carry it with you**. Under the UAE identity card rules, you should keep it with you and show it when the police or officials ask for it.
            - You'll need it for many everyday things, such as a local SIM card, a bank account or a hotel check-in.
            - Don't leave it with anyone as a deposit. Companies are not allowed to keep your Emirates ID.
            - If you lose it, tell JLS straight away. It has to be reported and replaced.

            ### Your Arrival Instructions

            JLS sends a document called **Arrival Instructions** with your visa. **It must travel with you.** Keep a printed copy with your passport and entry permit, keep a copy on your phone, read it before you fly, and **show it at immigration if you're asked**.

            ### Don't overstay

            If your job ends or your visa is cancelled, **talk to JLS about your visa before you do anything else**. Staying in the UAE after your visa has ended leads to daily fines and can lead to a ban.
          `),
          quiz("Your documents", [
            ["single", "Which document from JLS must travel with your passport and entry permit?", ["Your crew contract", "*The Arrival Instructions", "Your medical test results", "A letter from the Captain"], "Keep the Arrival Instructions with your passport, read them before you fly, and show them at immigration if asked."],
            ["multi", "What should you do with your Emirates ID? Choose all that apply.", ["*Carry it with you", "*Show it when the police or officials ask", "Leave it at a shop as a deposit", "*Tell JLS straight away if you lose it", "Keep it in your luggage on board"], "Carry it, show it when asked, never hand it over as a deposit, and report it if it's lost."],
            ["truefalse", "If you renew your passport, your UAE visa moves to the new passport automatically.", false, "The visa is linked to your passport number, so it has to be updated. Tell JLS before you renew."],
          ]),
        ]),
      ]),

      section("The law and local customs", [
        lesson("Drugs and medicines", [
          reading(`
            ### Drugs: zero tolerance

            The UAE has **zero tolerance** for drugs. Even a tiny amount can mean prison, a large fine and deportation. Trafficking can carry the death penalty.

            - **Traces in your body count.** The UAE treats drugs found in your blood or urine as possession, even if you took them in another country before you arrived.
            - **CBD is illegal too.** CBD oils, gummies, creams and vape liquids may be legal at home. Here they can be confiscated and lead to criminal charges. The same goes for "herbal highs".
            - **Luggage is scanned**, including bags of passengers who are only changing planes.
            - **Never carry a bag or parcel for someone else**, and never "hold onto something" for a friend.

            ### Medicines

            Some common medicines are **controlled** in the UAE: for example some strong painkillers (such as those containing codeine or tramadol), sleeping tablets, anxiety medicines and ADHD medicines. Even an over-the-counter product can contain a controlled ingredient.

            Before you travel:

            1. **Check** whether your medicine is controlled. The Ministry of Health and Prevention (**MOHAP**) publishes the list, and your doctor can help.
            2. **If it's controlled, apply for MOHAP approval online before you travel.** Without approval it can be refused at the airport, and you could be prosecuted.
            3. **Bring the prescription or a doctor's letter** in your name, covering the amount you carry.
            4. **Keep medicines in their original packaging** with the labels, in your hand luggage.
            5. **Bring personal amounts only.** GOV.UK advises up to three months' supply for visitors, and only one month for some controlled medicines. Limits can change, so check MOHAP's current rules.

            And tell the Captain, or whoever looks after medical care on board, about any regular medicine you take.
          `),
          image("uae-03-medicines.png", "Packing your medicines: check, get approval if needed, bring the prescription, original packs, personal amounts only"),
          sort("Medicines and the UAE", "Put each item in the right group.", ["Fine to bring with the prescription", "Check MOHAP rules first", "Against the law"], [
            ["Paracetamol in its original box", 0],
            ["Your blood pressure tablets, with the prescription", 0],
            ["Painkillers that contain codeine", 1],
            ["A prescription sleeping tablet", 1],
            ["ADHD medicine prescribed at home", 1],
            ["CBD oil for sore muscles", 2],
            ["A vape liquid that contains CBD", 2],
            ["Cannabis gummies bought legally abroad", 2],
          ]),
          quiz("Drugs and medicines", [
            ["truefalse", "If you used cannabis legally on holiday before flying in, you can't get into trouble for it in the UAE.", false, "Traces of drugs in your body are treated as possession, even if you took them abroad."],
            ["single", "Your medicine is on the UAE controlled list. When do you apply for MOHAP approval?", ["At the airport when you land", "Once you've got your Emirates ID", "*Online, before you travel", "You don't need to if you have a prescription"], "Controlled medicines need approval before you travel. A prescription on its own isn't enough."],
            ["multi", "Which of these help you bring medicines into the UAE legally? Choose all that apply.", ["*The prescription or a doctor's letter in your name", "*Original packaging with the labels", "Putting tablets in an unlabelled pill box to save space", "*Only bringing what you need for personal use", "Bringing a year's supply so you don't run out"], "Prescription, original packs and personal amounts. Unlabelled or very large quantities cause problems at customs."],
          ]),
        ]),
        lesson("Alcohol, smoking and vaping", [
          reading(`
            ### Alcohol

            - **The legal age is 21** to buy and drink alcohol in Dubai, Abu Dhabi and the other emirates where it's allowed.
            - **Drink only in licensed places**, such as hotel bars, restaurants and clubs, or in private. To buy alcohol to drink at home in Dubai, residents need a licence. Check the current rules before you buy.
            - **In Sharjah, alcohol is completely illegal**: drinking it and having it. Sharjah is right next to Dubai.
            - It's **illegal to drink, or to be drunk, in any public place**: the street, the beach, a park, a taxi. Most arrests for drink start with someone being loud, rude or disorderly.
            - **Drink-driving: zero tolerance.** Any amount of alcohol at all. After a crash, insurance is likely to be void.
            - **The yacht's own rules apply too.** Never drive the tender or work after drinking.

            ### Smoking and vaping

            - Smoking and vaping are **not allowed in enclosed public places**, such as malls, offices and public transport, except in marked smoking areas. On beaches and in parks, use the marked areas.
            - **Smoking in a car with a child under 12 is illegal.**
            - Vapes are treated much like cigarettes. **Any vape liquid with CBD or THC is illegal.**
            - In **Ramadan**, don't smoke or vape in public during daylight hours.
          `),
          quiz("Alcohol and smoking", [
            ["single", "Where can a 25-year-old crew member legally have a beer in Dubai?", ["On the beach", "*In a licensed hotel bar", "In a taxi on the way back to the marina", "Anywhere, as long as they don't get drunk"], "Licensed venues or in private. Drinking in any public place is illegal."],
            ["truefalse", "In Sharjah, drinking or having alcohol is illegal.", true, "Sharjah bans alcohol completely, even though it's right next to Dubai."],
            ["single", "How much alcohol can you have in your blood and still legally drive in the UAE?", ["One drink", "Under the UK limit", "*None at all", "Up to 0.5 g/L"], "Zero tolerance: any amount of alcohol is illegal when driving."],
          ]),
        ]),
        lesson("Behaviour in public and online", [
          reading(`
            Emiratis are proud of their country and their traditions, and modesty and good manners matter a lot here. Most of what follows is about respect. Much of it is also the law.

            ### Dress

            - In malls, shops, streets, offices and government buildings, dress **modestly**: shoulders and knees covered, nothing see-through, no slogans or pictures that could offend.
            - **Swimwear is for the beach and the pool only.** Cover up before you walk to the shops, a café or a taxi.

            ### Affection

            **Public displays of affection are frowned on, and kissing in public can lead to arrest.** Keep it private.

            ### Swearing, rude gestures and insults

            - **Swearing and rude gestures are illegal** in the UAE. That includes at other drivers, at taxi drivers, at shop staff and especially at the police.
            - **It's the same online.** Insulting someone in a WhatsApp message, a text, an email, a comment or a post is a crime under the UAE cybercrime law (Federal Decree-Law No. 34 of 2021). The penalty can be prison, a fine of **AED 250,000 to 500,000**, or both, and deportation.
            - **A private message is enough.** The other person only has to show a screenshot to the police.
            - If an argument starts, **stay calm and polite, and walk away**. Let the Captain or your Head of Department deal with a problem supplier or contractor.

            ### Photos and privacy

            - **Taking photos or videos of people without their permission, and sharing them, is a crime** under the same law, even in a public place. That includes filming a stranger, an argument, an accident, or someone's home or car. Penalties include prison and fines of hundreds of thousands of dirhams.
            - **Ask first.** If someone says no, respect it. And never post photos of guests or the owner (the yacht's privacy rules apply too).
            - **Don't photograph government buildings, military sites or airports.**
            - **Drones are tightly controlled.** Never fly one unless the Captain has confirmed it's registered and allowed.
          `),
          image("uae-04-in-public.png", "Dress modestly, swimwear only at the beach and pool, keep affection private, and no swearing or rude gestures: in person or online"),
          video("uae-a2-one-message.mp4", "Animation: one message, one big problem"),
          hotspot("Spot the problem", "Everyone on this promenade is enjoying the sunshine, but one person is breaking UAE law. Tap them.", "uae-06-promenade.png", SPOTS.photo),
          quiz("Behaviour in public and online", [
            ["single", "In the picture, why is the person with the phone breaking the law, and not the crew member photographing the yachts?", ["Phones aren't allowed on the promenade", "*They're photographing strangers (a family with a child) without permission", "They're holding the phone the wrong way", "They're not wearing a uniform"], "Photographing the view is fine. Photographing or filming people without their permission is a crime under UAE privacy and cybercrime law."],
            ["truefalse", "A rude WhatsApp message can't get you into trouble, because it's private.", false, "Insulting someone by message is a crime. A screenshot is all the police need."],
            ["single", "A taxi driver cuts in front of the car you're in and the crewmate driving wants to show him a rude gesture. What do you say?", ["Go on, he deserves it", "Only if he can't see your face", "*Don't. Rude gestures at other drivers are illegal and can lead to arrest", "Use the horn and the gesture together"], "Rude gestures and swearing at other drivers can lead to fines, jail or deportation."],
          ]),
        ]),
        lesson("Religion, Ramadan and the working week", [
          reading(`
            ### Islam and respect

            Islam is the official religion of the UAE. You'll hear the **call to prayer** five times a day, and you'll see people praying at work and in public places. Don't walk in front of, interrupt or photograph someone who is praying.

            Some mosques welcome visitors. If you visit, follow the dress code and the rules you're given. People of other faiths worship freely in their own places of worship.

            - **Insulting any religion is a serious crime** in the UAE, in person or online.
            - **Insulting the UAE, its rulers, its national symbols or its flag** is also a serious crime, with long prison sentences. Don't post, share or forward jokes, memes or comments about them, even in a group chat.

            ### Ramadan

            Ramadan is the holy month when Muslims **fast from dawn to sunset**: no food, drink or smoking. The dates move about 11 days earlier each year because they follow the Islamic (lunar) calendar. At sunset the fast ends with **iftar**, a meal often shared with family and friends, and the month ends with the **Eid al-Fitr** holiday.

            To be respectful during daylight hours in Ramadan:

            - **Don't eat, drink, smoke, vape or chew gum in public**, including in your car. Many restaurants and cafés stay open in the daytime, so eat inside them, or on board.
            - **Dress more modestly** than usual.
            - **Keep it quiet**: no loud music, dancing or swearing in public.
            - **Be patient.** People are fasting, and driving can be hurried just before sunset.
            - **Plan errands**: offices, shops and suppliers often change their hours.

            A friendly greeting is **"Ramadan Kareem"**.

            ### The working week

            Since 1 January 2022 the UAE government **weekend is Saturday and Sunday**, with a short working day on Friday. Many private companies follow the same week, but not all of them, so check with agents and suppliers. **Friday midday prayers** are the most important of the week: mosques are busy and some offices close early.
          `),
          image("uae-05-ramadan.png", "During daylight hours in Ramadan: no eating, drinking, smoking or chewing gum in public"),
          sort("Fine, fine with care, or not allowed?", "Put each situation in the right group.", ["Fine", "Fine, with care", "Not allowed: can lead to a fine or arrest"], [
            ["Taking a photo of the marina skyline", 0],
            ["Wearing swimwear at the beach", 0],
            ["Eating lunch in the crew mess on board during Ramadan", 0],
            ["Visiting a mosque that welcomes visitors", 1],
            ["Having a beer in a licensed hotel bar, aged 21 or over", 1],
            ["Eating inside a restaurant during the day in Ramadan", 1],
            ["Swearing at another driver", 2],
            ["Posting a video of a stranger's argument on social media", 2],
            ["Taking CBD gummies to help you sleep", 2],
            ["Drinking alcohol on a public beach", 2],
            ["Sharing a meme that mocks the UAE's rulers in a group chat", 2],
          ]),
          quiz("Religion and Ramadan", [
            ["single", "It's Ramadan, 2 pm, and you're thirsty walking through a mall. What do you do?", ["Drink from your bottle as you walk", "Drink quickly when nobody's looking", "*Wait until you're inside a restaurant or café, or back on board", "Buy a drink and finish it in the car"], "During daylight in Ramadan, don't eat or drink in public, including in your car. Restaurants and cafés that are open are fine."],
            ["truefalse", "Forwarding a joke that insults a religion in a private group chat can be a crime in the UAE.", true, "Insulting religions is a serious crime, and sharing it online counts, even in a private group."],
            ["single", "What is the UAE government weekend?", ["Thursday and Friday", "Friday only", "*Saturday and Sunday", "Friday and Saturday"], "Since 1 January 2022, Saturday and Sunday, with a short working day on Friday."],
          ]),
        ]),
      ]),

      section("Everyday life", [
        lesson("Heat, getting around and money", [
          reading(`
            From about June to September, daytime temperatures are often **above 40°C**, and it can be very humid on the coast. Teak decks, rails and cars get hot enough to burn. Heat illness can come on quickly, especially when you're working on deck or haven't drunk enough.

            ### Stay well

            - **Drink water regularly, before you're thirsty.** Add rehydration salts on long hot days. Alcohol and lots of caffeine make dehydration worse.
            - **Cover up**: a hat, sunglasses, light long sleeves, and sun cream.
            - **Plan heavy work** for the cooler early morning and evening, and take breaks in the shade or air conditioning. Look out for each other.
            - On land, the UAE bans outdoor work in direct sun from **12:30 to 3 pm between 15 June and 15 September**. On board, the Captain and your Head of Department set working hours. Tell them if you're struggling.

            ### Heat exhaustion: the signs

            Headache and dizziness, feeling or being sick, heavy sweating with pale clammy skin, cramps, a high temperature, being very thirsty, tired or irritable.

            ### What to do

            1. Move them somewhere **cool**.
            2. Take off extra clothing.
            3. Give **water**, a sports drink or rehydration salts.
            4. **Cool the skin**: spray or sponge with cool water and fan them. Cold packs wrapped in a cloth can go under the armpits or on the neck.
            5. Stay with them. **They should start to feel better within 30 minutes.**

            ### Heatstroke is an emergency

            **Call 998 for an ambulance**, and raise the alarm on board, if they're **not better after 30 minutes**, or they have **hot skin that has stopped sweating**, a very high temperature, fast breathing or heartbeat, confusion, a fit, or they pass out. If they pass out, put them in the recovery position while you wait.
          `),
          image("uae-07-heat.png", "Heat exhaustion and heatstroke: the signs, what to do, and when to call 998"),
          quiz("Heat", [
            ["multi", "Which are signs of heat exhaustion? Choose all that apply.", ["*Headache and dizziness", "*Heavy sweating with pale, clammy skin", "*Cramps in the arms, legs or stomach", "Feeling cold and shivering", "*Being very thirsty"], "These are the classic signs. Act early: cool them down and give fluids."],
            ["single", "A deckhand has been cooled and given water for 30 minutes but is now confused and has stopped sweating. What do you do?", ["Give them more water and wait another 30 minutes", "Send them to their cabin to sleep it off", "*Call 998 and raise the alarm on board: this may be heatstroke", "Give them a coffee to wake them up"], "Not better after 30 minutes, confusion and hot dry skin are signs of heatstroke, which is an emergency."],
          ]),
          reading(`
            ### Getting around

            - **Dubai Metro, trams and buses** are clean, cheap and air-conditioned. You pay with a rechargeable travel card (in Dubai, the **Nol card**). Some carriages are for **women and children only**, and the Gold Class carriage needs a Gold ticket.
            - **No eating or drinking** on the metro, trams or buses. You can be fined.
            - **Taxis** are metered and easy to find, and ride-hailing apps work too. The RTA's own app helps you plan journeys and top up your travel card.
            - **Cross roads only at crossings.** Crossing anywhere else (jaywalking) is illegal and you can be fined.

            ### Driving

            - **Visitors** may be able to drive with their home licence, an **International Driving Permit**, or both, depending on their nationality. An International Driving Permit has to be issued in your home country before you travel. Check with the rental company and the RTA.
            - **Once you're a resident**, you need a **UAE driving licence**. Licences from some countries can be exchanged without a test. Others mean lessons and tests. JLS can point you in the right direction.
            - The rules are strict: speed cameras everywhere, heavy fines, **zero alcohol**, no phone in your hand. After a crash, stop when it's safe and **don't leave the scene** until the police say you can.

            ### Money

            - The currency is the **UAE dirham (AED)**, pegged to the US dollar. Cards and contactless payment are accepted almost everywhere.
            - **VAT of 5%** is added to most things you buy.
            - Eating out, taxis and housing in marina areas can be expensive. Supermarkets are more reasonable. Budget before payday.
            - **Never let debts or unpaid bills build up.** In the UAE, unpaid bills (including hotel bills) and fraud can lead to prison, frozen bank accounts and a ban on leaving the country.

            ### Staying in touch

            - You can buy a local SIM card with your passport or Emirates ID.
            - Voice and video calls on some popular messaging apps are restricted in the UAE, so check which apps work for you.
            - Save these numbers in your phone: **the Captain, JLS, and your embassy or consulate.**
          `),
          quiz("Getting around and money", [
            ["single", "You're on the Dubai Metro on a hot day. Can you drink from your water bottle?", ["Yes, water is always fine", "Yes, but only in Gold Class", "*No: eating and drinking aren't allowed on the metro, and you can be fined", "Only if nobody else is in the carriage"], "Wait until you're off the train. Fines apply on the metro, trams and buses."],
            ["truefalse", "Once you have a UAE residence visa, you need a UAE driving licence to drive.", true, "Residents need a UAE licence. Depending on your nationality you may be able to exchange your home licence, or you may need lessons and tests."],
            ["single", "Why is it especially important not to leave unpaid bills in the UAE?", ["They'll just be added to your next salary", "*Unpaid bills can be a criminal matter, with prison, frozen accounts or a ban on leaving", "Nobody checks, so it doesn't matter", "You'll lose your Nol card"], "Unpaid debts and bills are taken very seriously in the UAE."],
          ]),
        ]),
      ]),

      section("If something goes wrong", [
        lesson("Emergencies, arrest and a lost passport", [
          reading(`
            Save these numbers in your phone now:

            | Number | For |
            | --- | --- |
            | **999** | Police: emergencies |
            | **998** | Ambulance |
            | **997** | Fire (Civil Defence) |
            | **996** | Coastguard: emergencies at sea |
            | **901** | Dubai Police: non-emergencies (questions, reports that aren't urgent) |

            Use 999 only for real emergencies. For something that isn't urgent, such as reporting a lost item in Dubai, call 901 or use the Dubai Police app or website.

            On board, **raise the alarm and follow the yacht's emergency procedures** as well.

            ### Then tell the Captain and JLS, straight away

            Whatever it is, the Captain and JLS need to know as soon as possible: an accident, an injury, anything involving the police, a theft, a lost passport or Emirates ID, or a problem with your visa. They can only help if they know.

            ### Your embassy or consulate

            Save the number of your country's embassy or consulate in the UAE. It can help with a lost or stolen passport, give you a list of local lawyers, and contact your family. It **cannot** get you out of prison, pay fines or overrule UAE law.
          `),
          image("uae-08-emergency-numbers.png", "Emergency numbers in the UAE, and who to tell next"),
          match("Match the number", "Match each number with what it's for.", [
            ["999", "Police: emergencies"],
            ["998", "Ambulance"],
            ["997", "Fire (Civil Defence)"],
            ["996", "Coastguard: emergencies at sea"],
            ["901", "Dubai Police: non-emergencies"],
          ]),
          quiz("Emergencies", [
            ["single", "A crewmate falls on the pontoon and is badly hurt. Which number do you call?", ["999", "*998", "997", "901"], "998 is the ambulance. Then tell the Captain and JLS."],
            ["single", "Who can your embassy NOT help you with?", ["Replacing a lost passport", "A list of local lawyers", "Contacting your family", "*Getting you released from prison"], "Embassies can help in many ways, but they can't override UAE law or get anyone out of prison."],
          ]),
          reading(`
            ### If you're stopped by the police or arrested

            1. **Stay calm and polite, and co-operate.** Don't argue, swear or resist, even if you think it's a mistake.
            2. **Ask for your embassy or consulate to be told.** You have the right to contact them.
            3. **Ask for an interpreter** if you don't fully understand what's being said.
            4. **Don't sign anything you don't understand.** Documents may be in Arabic, so ask for a translation first.
            5. **Get word to the Captain and JLS** as soon as you can.
            6. **Get a local lawyer.** Your embassy can give you a list. Legal aid is generally not available.

            Your passport may be held, and you may not be allowed to leave the UAE until the case is over.

            ### If you lose your passport, or it's stolen

            1. **Tell the Captain and JLS straight away.**
            2. **Report it to the police.** In Dubai you can use the Dubai Police app or website, or go to a police station.
            3. **Get the police report** (lost passport certificate). Your embassy and the immigration authorities will ask for it.
            4. **Contact your embassy** for a new passport, or an emergency travel document if you have to leave the UAE before a new one is ready.
            5. **JLS updates your visa** to the new passport. Your visa isn't cancelled, but it's linked to the old passport number.
            6. **Keep copies** of the new passport, your visa and your Emirates ID on your phone.

            If you lose your **Emirates ID**, report it and tell JLS too. It has to be replaced.
          `),
          order("Lost passport: what to do", "Put these steps in the right order.", [
            "Tell the Captain and JLS straight away",
            "Report the loss to the police",
            "Get the police report (lost passport certificate)",
            "Apply to your embassy for a new passport",
            "JLS moves your visa to the new passport",
            "Keep copies of the new passport, visa and Emirates ID",
          ]),
          quiz("Arrest and lost passports", [
            ["single", "You've been arrested and you're handed a document in Arabic to sign. What do you do?", ["Sign it so you can go home sooner", "Refuse to say anything at all", "*Politely ask for a translation and don't sign until you understand it", "Tear it up"], "Never sign a document you don't understand. Ask for an interpreter and for your embassy to be told."],
            ["truefalse", "If you lose your passport, your UAE visa is cancelled and you have to start again.", false, "The visa isn't cancelled. Once you have a new passport, JLS has it moved across."],
          ]),
        ]),
        lesson("Final check", [
          quiz("Final quiz", [
            ["single", "Which document from JLS must you keep with your passport and show at immigration if asked?", ["Your crew contract", "*The Arrival Instructions", "The yacht's crew list", "Your bank details"], "The Arrival Instructions travel with your passport and entry permit."],
            ["truefalse", "In the UAE, drugs found in your blood are treated as possession, even if you took them abroad.", true, "Traces count. The UAE has zero tolerance for drugs."],
            ["single", "Your medicine is on the UAE controlled list. What do you do?", ["Bring it in your checked bag", "*Get MOHAP approval before you travel and bring the prescription", "Buy it when you arrive", "Bring it in an unlabelled box"], "Controlled medicines need MOHAP approval before you travel, plus the prescription and original packs."],
            ["multi", "Which of these are against the law in the UAE? Choose all that apply.", ["*Swearing at another driver", "*Sending an insulting WhatsApp message", "Having a drink in a licensed hotel bar, aged 21", "*Posting a video of a stranger without their permission", "Taking a photo of the skyline"], "Swearing, insults online and photographing people without permission are all crimes. A drink in a licensed venue and photos of the view are fine."],
            ["single", "During daylight hours in Ramadan, what should you avoid in public?", ["Walking in the mall", "Using your phone", "*Eating, drinking, smoking or chewing gum", "Taking a taxi"], "Out of respect for people who are fasting, and including in your car."],
            ["single", "Which number do you call for the coastguard?", ["999", "998", "*996", "901"], "996 is the coastguard, for emergencies at sea."],
            ["single", "A crewmate has stopped sweating, has hot skin and is confused after working on deck. What is this, and what do you do?", ["Tiredness: let them sleep", "Hunger: give them a snack", "*Possible heatstroke: call 998 and raise the alarm", "Seasickness: give them a tablet"], "Hot skin that has stopped sweating and confusion are signs of heatstroke, which is an emergency."],
            ["single", "Something has gone wrong ashore: you've been in a minor accident and the police are involved. Who must you tell straight away?", ["Nobody, unless you're charged", "Only your family", "*The Captain and JLS", "Your crewmates in the group chat"], "Whatever it is, tell the Captain and JLS straight away so they can help."],
          ]),
          ack("I have completed this course. I understand that it is general guidance, not legal advice, and that UAE laws can change. I will respect UAE laws and customs, keep my passport, Emirates ID and Arrival Instructions as I've been told, check my medicines before I travel, think before I post, message or photograph anyone, and tell the Captain and JLS straight away if anything goes wrong. If I'm not sure about something, I will ask JLS or the Captain first."),
        ]),
      ]),
    ],
  };
}

export const buildCourse = makeBuild(content);

export const MEDIA_FILES = [
  "uae-01-cover.png", "uae-02-visa-steps.png", "uae-03-medicines.png", "uae-04-in-public.png",
  "uae-05-ramadan.png", "uae-06-promenade.png", "uae-07-heat.png", "uae-08-emergency-numbers.png",
  "uae-a1-airport-to-emirates-id.mp4", "uae-a2-one-message.mp4",
];
