// "Guest privacy, confidentiality and social media" — JLS crew-life course, in the
// Crew Academy content shape (src/lib/academy/content.ts). Files are referenced by name
// ("@gp-01-cover.png") and swapped for academy_media ids by buildCourse(mediaIds).
//
// Aligned to (checked October 2026):
// - EU GDPR (Regulation (EU) 2016/679) and the UK GDPR: Art. 5(1) principles (purpose
//   limitation, data minimisation, storage limitation, integrity and confidentiality);
//   Art. 9 special category data (health); Art. 33 breach notification to the supervisory
//   authority within 72 hours of becoming aware. ICO guide to the UK GDPR.
// - UAE Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data (PDPL):
//   Art. 2 scope (data subjects in the UAE, controllers inside or outside the UAE; free
//   zones with their own law, e.g. DIFC and ADGM, excluded); "sensitive personal data"
//   includes physical and psychological health; Arts. 5, 7 and 8 (purpose, limits,
//   security, erasure); Art. 9 (notify the Data Office and the data subject of a breach
//   immediately on becoming aware). Summaries: Mondaq overview of the UAE PDPL; Hunton.
// - UAE Federal Decree-Law No. 34 of 2021 on Combatting Rumours and Cybercrimes, Art. 44:
//   using an IT means to invade privacy (including taking, keeping or sharing photos of
//   others without consent) — imprisonment of at least 6 months and/or a fine of
//   AED 150,000–500,000 (Gulf News; BSA Law note on Art. 44).
// - Maritime Labour Convention 2006, Regulation 5.1.5 / Standard A5.1.5: on-board
//   complaint procedures and no victimisation of seafarers who complain.
// - Industry guidance on crew confidentiality: Conventus Law "Crew contracts and superyacht
//   confidentiality in TikTok times" (SEA confidentiality clauses, MYBA charter terms,
//   carve-outs for disclosure to authorities, consequences of breach); Northrop & Johnson
//   "Confidentiality in 2026: NDAs, social media, guest privacy and hidden risks";
//   Dockwalk on NDAs and yacht crew. Yacht Crew Help (ISWAN): free, confidential 24-hour
//   helpline for yacht crew.
// Crew awareness only. Each yacht's own confidentiality agreement, social media policy and
// data protection procedures come first; the course says so wherever they may differ.
// Builds on, and does not repeat, the "Privacy and social media" lesson in "Cyber security
// at sea — crew awareness". All names in examples (yacht, marina, handles) are invented.
import { reading, image, video, ack, quiz, hotspot, match, order, sort, lesson, section, makeBuild } from "../blocks.mjs";
import { POST_SPOTS } from "./pictures.mjs";

export const COURSE = {
  title: "Guest privacy, confidentiality and social media",
  category: "Crew conduct",
  minutes: 35,
  passMark: 80,
  refreshMonths: 12,
  summary:
    "Privacy is a big part of what owners and guests are paying for. Know what your confidentiality agreement covers and how long it lasts, post safely (or not at all), handle people ashore and the press, look after guest passports, preference sheets and health notes the way data protection law expects, and keep it all confidential after you leave.",
};

export function content() {
  return {
    sections: [
      section("Why privacy matters", [
        lesson("Privacy is part of the job", [
          image("gp-01-cover.png", "Guest privacy, confidentiality and social media"),
          reading(`
            Owners and guests come on board to relax, away from cameras, crowds and attention. For many of them, **privacy is a big part of what they are paying for**, as much as the food, the service or the places they visit.

            That privacy depends on the crew. You see who comes on board, hear conversations, know where the yacht is going next, and handle passports and personal details. Many leaks are not deliberate at all: a quick post, a chat in a bar, a photo with something in the background.

            **Why it matters:**

            - **Safety.** Knowing where a well-known person is, and when, helps criminals, stalkers and anyone who wants to harm them or their family.
            - **Trust.** An owner who can't trust the crew to be discreet will change the crew. Yachting is a small industry, and reputations travel.
            - **The law.** Guest information is protected by data protection law. In some countries, including the UAE, sharing photos of people without their consent can be a crime.
            - **Your contract.** Most crew agreements include a confidentiality clause. Breaking it can lead to dismissal and even legal action.

            The cyber security course has a short lesson on privacy and social media. This course goes further: your confidentiality agreement, posting safely, people ashore and the press, guest data on board, and what happens after you leave.
          `),
          image("gp-02-who-wants-to-know.png", "Who wants to know where the yacht is, and who's on board?"),
          quiz("Check your understanding", [
            ["single", "Why do owners and guests care so much about the crew being discreet?", ["Because the flag state requires it for every yacht", "*Privacy, and the safety that comes with it, is a big part of what they are paying for", "Because crew photos can make the yacht look untidy", "Because the yacht's insurance won't pay out otherwise"], "Owners and guests choose yachts so they can be private. Where they are, who they are with and what they do is exactly what the press, criminals and stalkers want to know."],
            ["truefalse", "A leak only counts if you meant to give something away.", false, "A careless post or a chat in a bar can do the same damage as selling a story, and it can still break your confidentiality agreement."],
            ["single", "A friend from home messages: \"Who've you got on board? I promise I won't tell anyone.\" Why is it still a problem to answer?", ["It isn't a problem if they're a close friend", "*Once you've said it, you can't control where it goes: screenshots and conversations travel", "It's only a problem if you mention the yacht's name", "It's only a problem while the guests are still on board"], "Your friend may mean well, but they will tell someone, who tells someone else. The only safe answer is the same one you give everyone."],
          ]),
        ]),
        lesson("Your confidentiality agreement", [
          reading(`
            ### What it is

            Almost every crew member signs something about confidentiality: a clause in your **Seafarer Employment Agreement (SEA)** or crew contract, or a separate **non-disclosure agreement (NDA)**. Charter guests usually have privacy terms in the charter contract too, and some ask the crew to sign their own NDA.

            Every agreement is different, so **read yours, and ask your Head of Department (HoD) or the Captain about anything that isn't clear.** They usually cover:

            - **Who is on board:** the owner and guests, their families and friends, their names and faces.
            - **Where and when:** where the yacht is, where she's going next, and the dates.
            - **What happens on board:** conversations, behaviour, visitors, parties.
            - **Photos, videos and recordings** taken on board.
            - **The yacht itself:** the layout, security arrangements, systems and codes.
            - **Business and money:** the owner's business, deals and costs, and anything you overhear.
            - **Guest information:** passports, preference sheets, health notes, guest lists.

            Many also cover social media: some yachts ban posting anything about the yacht, others allow only posts the Captain has approved.

            ### It lasts after you leave

            Confidentiality usually carries on **after you leave the yacht**, often with no end date. What you saw this season is still confidential years from now.

            ### What can happen if it's broken

            It doesn't have to be deliberate to count. Depending on the agreement, a breach can lead to dismissal, a claim for damages, and a court order to take posts down.

            ### What it doesn't stop

            A confidentiality agreement protects privacy. It is not a gag. It doesn't stop you:

            - reporting a **crime** to the police or the proper authorities;
            - raising a **safety concern, harassment or abuse** through the yacht's complaint procedure, the management company, the flag state or the port authorities;
            - getting **confidential advice**, for example from a lawyer, your union, or **Yacht Crew Help**, a free, confidential 24-hour helpline for yacht crew run by the seafarers' charity ISWAN.

            Yachts covered by the Maritime Labour Convention (MLC 2006) must have an on-board complaint procedure, and crew must not be victimised for using it.
          `),
          image("gp-03-agreement.png", "What a confidentiality agreement usually covers"),
          sort("Confidential, or fine to share?", "Put each one in the right group. (Your own agreement always comes first.)", ["Keep it confidential", "Usually fine to share"], [
            ["The owner's name", 0],
            ["Which guests are on board this week", 0],
            ["That you work on a motor yacht as a deckhand", 1],
            ["Where the yacht is heading after this port", 0],
            ["The code for the crew door", 0],
            ["Skills you've learned, like tender driving or silver service", 1],
            ["Something a guest said at dinner", 0],
            ["That you've enjoyed the season and the crew are great", 1],
          ]),
          quiz("Your agreement", [
            ["truefalse", "Once you've left the yacht, your confidentiality agreement no longer applies.", false, "Confidentiality usually carries on after you leave, often with no end date. Read your own agreement to be sure."],
            ["single", "During a trip, you see something you believe is a crime. Does your confidentiality agreement stop you reporting it?", ["Yes: everything that happens on board is confidential", "*No: it doesn't stop you reporting a crime or a safety concern to the proper people", "Only if the owner gives permission", "Only once you've left the yacht"], "Confidentiality protects privacy. It doesn't stop you reporting a crime, a safety concern, harassment or abuse, or getting confidential advice."],
            ["single", "How do you find out exactly what your confidentiality agreement covers?", ["Ask other crew what theirs says", "Search online for a typical yacht NDA", "*Read your own agreement, and ask your HoD or the Captain if anything isn't clear", "Assume it only covers guests' names"], "Every agreement is different. Yours is the one that counts."],
          ]),
        ]),
      ]),

      section("Social media", [
        lesson("Before you post", [
          reading(`
            Social media is where most privacy slips happen. Some yachts ban posting about the yacht altogether; others allow it with rules. **Follow your yacht's own policy: it always comes first.** Where posting is allowed, these are the rules almost every yacht expects:

            1. **No guests, ever.** Not their faces, not the backs of their heads, not their children, cars, luggage or name cards.
            2. **No location while it matters.** Turn off location tags. Photos taken on a phone can also store where they were taken, so switch off location for the camera. Don't name the marina, the anchorage or the next stop.
            3. **Post later, not live.** Wait until the yacht has moved on and the guests have left. A photo posted "just now" says "she's here right now".
            4. **No yacht name.** Not in the caption, not in a hashtag, and don't tag the yacht's own account.
            5. **Check the background, and the reflections.** Life rings, cushions, towels and tenders often carry the yacht's name. Sunglasses, windows and shiny surfaces reflect names and people. Marina signs, landmarks and other yachts show where you are.
            6. **No passes, paperwork or screens.** Crew passes, boarding passes, guest lists, preference sheets, and any screen: navigation, CCTV, laptops, or a guest's TV showing their account.
            7. **No plans or schedule.** "Owner arrives Friday", "12 guests this week" and "off to the islands tomorrow" tell a stranger exactly what they want to know.
            8. **Don't tag crewmates without asking.** Their profiles may name the yacht even if yours doesn't.

            Private accounts, "close friends" lists and stories that disappear after 24 hours are not safe either: anyone who can see them can screenshot them.

            **If in doubt, don't post.**
          `),
          hotspot("Who shouldn't be here?", "This crew selfie was meant to be harmless. Tap the person who should never appear in a crew member's post.", "gp-04-post.png", POST_SPOTS.guest),
          hotspot("Where is she?", "Tap something that tells a stranger exactly where the yacht is.", "gp-04-post.png", POST_SPOTS.where),
          hotspot("Which yacht?", "Tap something that names the yacht.", "gp-04-post.png", POST_SPOTS.name),
          quiz("Before you post", [
            ["single", "Your yacht allows crew to post. When is the best time to share a photo from a guest trip?", ["Straight away, while it's still exciting", "*After the yacht has moved on and the guests have left", "That evening, once the guests have gone to bed", "Any time, as long as your account is private"], "Posting later means nobody can use it to find the yacht or the guests. A private account can still be screenshotted."],
            ["multi", "Which of these could show where the yacht is? Choose all that apply.", ["*A marina sign behind you", "*A location tag on the post", "*A well-known lighthouse or landmark", "A close-up of the book you're reading"], "Signs, tags and landmarks all point to a place. Check every corner of the picture before you post."],
            ["truefalse", "A story shared only with your \"close friends\" list is a safe place for photos of guests.", false, "Guests never appear in crew posts, whoever can see them. Anyone on the list can screenshot and share it."],
          ]),
        ]),
        lesson("How one post finds the yacht", [
          reading(`
            None of the details in a post has to be secret on its own. People who want to find a yacht put small clues together: a reflection, a sign, a tag, the time it was posted, and the other posts on your profile.

            Watch how it works. The animation is silent, with captions.
          `),
          video("gp-a1-one-post.mp4", "Animation: how one harmless post finds the yacht"),
          match("What does it give away?", "Match each detail with what it tells a stranger.", [
            ["The yacht's name on a life ring, reflected in your sunglasses", "Which yacht it is"],
            ["A lighthouse and a marina sign in the background", "Which port she's in"],
            ["\"Posted 2 minutes ago\"", "That she's there right now"],
            ["An older post: \"Owner arrives Friday!\"", "When the owner will be on board"],
            ["A guest reflected in the saloon window", "Who is on board"],
          ]),
          quiz("Clues add up", [
            ["truefalse", "If no single detail in your photo is secret, the photo is safe to post.", false, "Clues add up. A reflection, a landmark, a tag and the time of posting together can tell a stranger where the yacht is and who is aboard."],
            ["single", "In the animation, what told the stranger the yacht was there right now?", ["The crew member's uniform", "*It was posted live, with a location tag", "The colour of the sea", "The number of likes"], "Live posting plus a location tag says \"here, now\". Wait until the yacht has moved on, and leave the location off."],
          ]),
        ]),
        lesson("Guests, phones and photos", [
          reading(`
            ### Your phone in guest areas

            Follow your yacht's rules on phones. Most yachts expect crew to keep personal phones **out of sight in guest areas** and **never to take photos or videos** where guests are, or of their cabins, belongings or children. If you need your phone for work, use it for that only.

            Never photograph a guest, even from a distance, even "just to show my family the view".

            **In the UAE, this is the law as well as the rule.** Using a phone or any other device to photograph or film people without their consent, or to share those pictures, can be a crime under Federal Decree-Law No. 34 of 2021. The penalty can be prison, a fine of AED 150,000 or more, or both. Other countries have their own privacy laws.

            ### When a guest asks for a photo with you

            It happens, and it can be a lovely moment. Follow your yacht's policy. Where it's allowed:

            - it's **their photo, on their phone**. Don't take your own copy;
            - **don't post or share it**, and don't tag the yacht, even if they post it themselves;
            - if you're not sure, smile and say you'll just check with your HoD.

            Never ask a guest for a photo or a selfie, however famous they are.

            ### When a guest posts you

            If a guest posts a photo with you or the yacht in it, **don't like, comment, share or tag**: that links your profile, and the yacht, to them. If their post shows more than it should, like a crew pass, the yacht's name or a screen, tell your HoD and let the Captain decide what to do.

            ### Guests' screens and devices

            If you're asked to help with a guest's TV, tablet or laptop, do only what you were asked. Don't read their messages, browse their photos or photograph their screen.
          `),
          image("gp-05-guest-photo.png", "When a guest asks for a photo with you"),
          quiz("Guests and photos", [
            ["single", "A guest asks you to join a group photo on the sundeck, and your yacht's policy allows it. What's right?", ["*Join in on their phone, and don't share or post it yourself", "Take it on your phone too, so you can send it to them", "Post it: the guest asked for the photo", "Refuse: crew photos with guests are illegal everywhere"], "It's their photo, on their phone. You don't keep a copy and you don't post it, even if they do."],
            ["truefalse", "It's fine to photograph a guest from a distance as long as you never post it.", false, "Photographing guests at all breaks their privacy and almost certainly your agreement. In the UAE, photographing people without their consent can also be a crime."],
            ["single", "A guest posts a photo that clearly shows your crew pass. What do you do?", ["Comment on the post asking them to take it down", "*Tell your HoD and let the Captain decide what to do", "Share it so your friends can see", "Ignore it: it's their post, not yours"], "Don't draw attention to it publicly. The Captain can deal with it discreetly."],
          ]),
        ]),
      ]),

      section("People ashore and the press", [
        lesson("Who's asking?", [
          reading(`
            Most people who ask about the yacht are just curious. A few are not, and from the outside you can't tell which is which. So treat every question the same way.

            **Who asks:**

            - **Friends and family at home.** "Anyone famous on board?" They mean well, but they tell other people.
            - **Other crew, in bars and on the dock.** Gossip travels fast round a marina, and it isn't always only crew listening.
            - **"Journalists" and photographers.** Some say who they are, some don't. They may offer money, say they "already know" and just want you to confirm, or ask something innocent-sounding like "when do they usually go ashore?"
            - **Recruiters and brokers.** A genuine recruiter needs your experience, not your owner's name. Anyone who asks who owns the yacht, who's chartering her or where she's going next is fishing.
            - **Strangers online.** Friendly messages or job offers on social media or crew job sites that drift into questions about the yacht.

            **Your answer is always the same: "Sorry, I can't talk about the boat or who's on it."** Keep it friendly, don't add anything, and change the subject or walk away. You don't have to explain, and you don't have to say yes or no.

            **Watch out for:** someone who seems to know already and only wants you to confirm ("it's their boat, isn't it?"); offers of money, drinks or favours; and pressure ("everyone knows anyway"). Saying "it's not them" gives information away just as much as saying "yes".

            If someone pushes, offers money or keeps turning up, **tell the Captain or your HoD.** It may be part of a bigger picture the yacht's security needs to know about.
          `),
          image("gp-06-ashore.png", "Friendly questions, fishing for answers. Your answer is always the same."),
          sort("Fine to say ashore?", "Put each one in the right group.", ["Fine to say", "Don't say it"], [
            ["\"I work on a yacht and I love the job.\"", 0],
            ["\"Sorry, I can't talk about the boat or who's on it.\"", 0],
            ["\"It's hard work, but the crew are great.\"", 0],
            ["\"We're off to the islands on Friday.\"", 1],
            ["\"You'd definitely recognise one of our guests.\"", 1],
            ["\"No, it's not her boat.\"", 1],
            ["\"The owner's lovely, really down to earth.\"", 1],
            ["\"We're the big blue one at the end of the dock.\"", 1],
          ]),
          quiz("Who's asking?", [
            ["single", "In a bar, a friendly stranger says: \"Come on, everyone knows whose boat that is. Just nod.\" What do you do?", ["Nod: they clearly know already", "Shake your head to put them off", "*Say you can't talk about the boat or who's on it, and change the subject", "Tell them a different owner's name as a joke"], "Confirming or denying both give information away. The same friendly answer, every time, gives nothing."],
            ["single", "A recruiter on a crew job site asks for your owner's name \"to check your references\". What's right?", ["Give it: references need it", "*Don't give it. Offer the Captain's or management company's contact for references, if your yacht allows it", "Give the name but ask them to keep it private", "Send them a photo of your contract instead"], "References come through the Captain or management company. A recruiter never needs the owner's name to place you."],
          ]),
        ]),
        lesson("If something leaks, or the press get in touch", [
          reading(`
            ### If the press get in touch

            Journalists and photographers may call the yacht, message you on social media, wait on the dock or start a conversation in a bar.

            - **Don't comment.** Don't confirm, deny or add anything, and don't give names or say when people come and go. Say: *"Sorry, I can't talk about the boat or who's on it,"* and walk away or end the call.
            - **Don't reply** to messages, and don't post anything about it.
            - **Note** who they were, what they asked, and when and how they got in touch.
            - **Tell the Captain or your HoD** straight away. Dealing with the press is never the crew's job; the yacht's management or the owner's office will usually have someone who does it.

            ### If something leaks

            You might spot a post, an article or a photo of the yacht or a guest online, or realise you've shared something you shouldn't have.

            1. **Don't make it worse.** Don't like, share or comment on it, and don't discuss it in crew group chats.
            2. **If it's your post, take it down** straight away, then tell your HoD. Deleting it doesn't undo screenshots, so the Captain still needs to know.
            3. **Tell the Captain or your HoD** what you've seen and where. Don't pass round screenshots of guests.
            4. **If guest information is involved** (a passport copy, a guest list or health notes sent to the wrong person), report it at once. Data protection law may require the yacht's management to report it quickly: within 72 hours of finding out under the UK and EU GDPR, and immediately under the UAE law.

            Owning up quickly matters far more than the mistake. Keeping quiet is what turns a slip into a crisis.
          `),
          order("A photographer stops you on the dock", "Put these steps in the right order.", [
            "Stay polite: \"Sorry, I can't talk about the boat or who's on it.\"",
            "Don't confirm, deny or add anything, and walk away",
            "Note who they were, what they asked and when",
            "Tell the Captain or your HoD straight away",
            "Follow the Captain's instructions: the yacht's management deals with the press",
          ]),
          quiz("Leaks and the press", [
            ["single", "You realise your story from this morning shows the yacht's name on the tender. What do you do first?", ["Leave it: stories disappear after 24 hours", "*Delete it now, then tell your HoD", "Edit the caption so it doesn't mention the yacht", "Ask your followers not to share it"], "Take it down at once, then tell your HoD. Someone may already have screenshotted it, so the Captain needs to know."],
            ["truefalse", "Talking to a journalist about the yacht is fine as long as you don't name the owner.", false, "Don't comment at all. Small details help them confirm a story. Tell the Captain or your HoD."],
            ["single", "A crewmate has emailed the guest list to the wrong port agent by mistake. What should happen?", ["Nothing: the agent will probably delete it", "*Report it to the Captain straight away, so the management can deal with it and with any report the law requires", "Quietly ask the agent to delete it and say no more", "Wait and see whether anything comes of it"], "Guest data sent to the wrong person is a data breach. The law may give the management only hours or days to report it, and the clock starts when the yacht finds out."],
          ]),
        ]),
      ]),

      section("Guest data on board", [
        lesson("Passports, preference sheets and guest lists", [
          reading(`
            Before and during a trip, the yacht collects a lot about the people on board: **passport and visa copies** for immigration and port agents, **preference sheets** (what guests like to eat, drink and do), **medical and dietary notes** (allergies, conditions, medication), and **guest lists, cabin plans and travel details**. Your own passport and medical certificates deserve the same care.

            ### What the law says, in plain terms

            All of this is **personal data**: information about a person who can be identified. Which law applies to a yacht depends on things like where the owner's and management companies are, where the yacht is, and who the guests are. It may be:

            - **the EU GDPR or the UK GDPR**, Europe's data protection rules;
            - **the UAE Personal Data Protection Law** (Federal Decree-Law No. 45 of 2021), which can apply to companies outside the UAE that handle data about people in the UAE. Some free zones, such as the DIFC and ADGM, have their own similar laws.

            You don't need to work out which one applies: that's for the Captain and the management company. **The everyday rules for crew are the same under all of them:**

            - **Only what's needed, only for those who need it.** Share information only with the people who need it to do their job. The chef needs to know about the allergy, not the passport number.
            - **Through the yacht's proper channels.** Use the yacht's own systems and email, and send things only to the people the Captain names: the agent, the management company, the authorities.
            - **Never personal email, WhatsApp or your own phone.** Don't photograph passports on your phone, forward guest lists to your personal email, or share preference sheets in a group chat.
            - **Keep it locked away.** Paper in a locked drawer or office, screens locked when you step away, files saved in the right place. Not left on the galley counter, the crew mess table or the printer.
            - **Don't keep it longer than needed.** When it's finished with, shred it or delete it as your yacht's policy says.

            **Health information is extra sensitive.** The GDPR calls it "special category data" and the UAE law calls it "sensitive personal data". A guest's allergy or medical condition should be known only to the crew who need it to keep them safe, such as the chef, the chief stew and whoever is responsible for medical care on board, and kept out of crew chat.

            ### If it goes wrong

            A passport copy sent to the wrong address, a lost guest list, a preference sheet left in a bar: tell the Captain or your HoD at once. The management may have to report it to the data protection regulator, and sometimes to the guest, and the time limit starts when the yacht finds out.
          `),
          image("gp-07-guest-data.png", "Five rules for guest information"),
          match("The right way to handle it", "Match each piece of guest information with the right way to handle it.", [
            ["Guest passport copies for the port agent", "Sent by the Captain or purser through the yacht's own channels"],
            ["A guest's serious nut allergy", "Told to the chef and the crew who serve that guest"],
            ["Last charter's printed preference sheets", "Shredded, as your yacht's policy says"],
            ["The guest list left on the pantry printer", "Collected straight away and locked away"],
            ["An agent asking you to WhatsApp passport photos", "Politely referred to the Captain or purser"],
          ]),
          quiz("Guest data", [
            ["single", "A guest has a serious shellfish allergy. Who should know?", ["Every crew member, through the crew WhatsApp group", "*The crew who prepare and serve their food, and whoever handles medical care, through the yacht's proper briefing", "Only the Captain", "Nobody: it's medical information"], "Need to know works both ways: the people who need it must have it to keep the guest safe, and nobody else should."],
            ["truefalse", "It's fine to photograph guests' passports on your own phone, as long as you delete the photos afterwards.", false, "Photos on a personal phone can back up to the cloud and stay there long after you delete them. Passports go through the yacht's own systems only."],
            ["multi", "Which of these are personal data that must be protected? Choose all that apply.", ["*A copy of a guest's passport", "*A preference sheet listing a guest's favourite wine", "*A cabin plan with the guests' names on it", "The yacht's fuel consumption for the trip"], "Anything about a person who can be identified is personal data, even something as harmless-looking as a favourite wine."],
          ]),
        ]),
      ]),

      section("After you leave", [
        lesson("CVs, references and your next job", [
          reading(`
            Your confidentiality agreement doesn't end when you walk down the passerelle for the last time. Everything in this course still applies.

            ### Your CV and online profiles

            Describe **the role, the yacht and your skills**, not the people:

            - the size and type of yacht ("60 m private motor yacht"), private, charter or both, and the cruising areas;
            - your position, the size of your team, guest numbers and what you were responsible for;
            - your skills, courses and certificates.

            **Leave out** the owner's and guests' names, famous guests you looked after, the owner's homes or usual plans, and photos of the interior or guest areas, unless you have permission in writing. Whether you can name the yacht itself depends on your agreement: some allow it, some don't.

            ### References and interviews

            References usually come from the Captain or your HoD, through the yacht's or the management company's details. In interviews the same rule applies: talk about what you did, not who you did it for. Your next owner wants crew who won't talk about them either, so discretion counts in your favour.

            ### Photos and files

            When you leave, delete work photos, guest lists, preference sheets and crew documents from your phone, laptop and cloud storage, unless the Captain asks you to keep something. Leave work accounts and crew group chats when you're asked to. And the social media rules carry on: a "throwback" post of last season's guests is still a breach.
          `),
          image("gp-08-cv.png", "Describe the role, not the people"),
          quiz("After you leave", [
            ["single", "Which CV line is right for a job on a private yacht?", ["Deckhand for [the owner's full name], 2024–2026", "*Deckhand, 50 m private motor yacht, Mediterranean and Caribbean, 2024–2026", "Deckhand: looked after [a famous guest] on their birthday trip", "Deckhand: photos of the owner's suite attached"], "Describe the yacht, the role and your skills. Names, famous guests and photos of guest areas stay out unless you have written permission."],
            ["truefalse", "Two years after leaving, it's fine to post a \"throwback\" photo of the guests you looked after.", false, "Confidentiality usually has no end date, and guests never appear in crew posts."],
            ["single", "In an interview for your next job, you're asked: \"So who was the owner on your last yacht?\" What do you say?", ["Tell them: they're your future employer", "*Say you can't share that, and talk about the role and the yacht instead", "Give them a hint so they're impressed", "Say you'll tell them once you're hired"], "A good employer will respect it. It shows them you'll be just as discreet about them."],
          ]),
        ]),
        lesson("Final check", [
          quiz("Final quiz", [
            ["single", "The owner arrives tomorrow and you'd like to post a sunset photo from the aft deck. What's the best plan?", ["Post it now, with no caption", "Post it to your \"close friends\" story only", "*If your yacht allows it, wait until she's moved on, check the background and reflections, and leave off the location", "Post it now, but don't tag the yacht's account"], "Post later, not live; nothing in the background; no location. And always follow your yacht's own policy."],
            ["multi", "What does a crew confidentiality agreement usually cover? Choose all that apply.", ["*Who is on board", "*Where the yacht is going next", "*Conversations you overhear", "Your own training certificates"], "Your own qualifications are yours to share. The people, the plans and what happens on board are not."],
            ["truefalse", "Confirming a rumour (\"yes, it's their boat\") is fine if the person already seems to know.", false, "Confirming is exactly what they want. Give the same answer every time: you can't talk about the boat or who's on it."],
            ["single", "The port agent asks you to WhatsApp copies of the guests' passports. What do you do?", ["Send them: it's quicker", "Send them from your personal email instead", "*Politely refer the agent to the Captain or purser, who sends them through the yacht's proper channels", "Photograph them now and send them later"], "Guest documents only go through the yacht's own channels, sent by the people the Captain names."],
            ["single", "A journalist rings the yacht and asks whether the owner is on board. What do you do?", ["Say \"no comment\" and hang up, and leave it there", "*Say you can't talk about the boat or who's on it, end the call, and tell the Captain or your HoD", "Give general facts only, like the yacht's size", "Ask them to email their questions to you"], "Don't comment, and always tell the Captain or your HoD: they may be part of something bigger."],
            ["truefalse", "Your confidentiality agreement stops you reporting a crime or a safety concern to the proper authorities.", false, "Confidentiality protects privacy. It is not a gag on reporting crime, safety concerns, harassment or abuse."],
            ["single", "Who may see a guest's medical notes?", ["*Only the crew who need them to keep the guest safe", "Everyone in the interior team", "Any crew member who asks", "The whole crew, just in case"], "Health information is extra sensitive under data protection law. Need to know only."],
            ["multi", "Which of these could reveal the yacht's name in a photo? Choose all that apply.", ["*A life ring or the tender", "*Branded towels or cushions", "*A reflection in sunglasses or a window", "A clear blue sky"], "Check every corner of the picture, including reflections, before you post."],
            ["single", "You posted a photo this morning and now notice a guest in the background. What do you do?", ["Crop the guest out and post it again", "*Delete it straight away and tell your HoD", "Leave it: hardly anyone will notice", "Message the guest to ask if they mind"], "Take it down and tell your HoD. Someone may already have seen or saved it, so the Captain needs to know."],
          ]),
          ack("I have completed this course. I will keep what I see and hear on board confidential, during my time on the yacht and after I leave; follow my yacht's social media policy and never post guests, locations, plans or the yacht's name; answer anyone who asks with \"I can't talk about the boat or who's on it\"; handle guest information only through the yacht's proper channels; and tell the Captain or my HoD straight away if something leaks or the press get in touch."),
        ]),
      ]),
    ],
  };
}

export const buildCourse = makeBuild(content);

export const MEDIA_FILES = [
  "gp-01-cover.png", "gp-02-who-wants-to-know.png", "gp-03-agreement.png", "gp-04-post.png",
  "gp-05-guest-photo.png", "gp-06-ashore.png", "gp-07-guest-data.png", "gp-08-cv.png",
  "gp-a1-one-post.mp4",
];
