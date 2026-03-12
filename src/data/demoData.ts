import { LessonPlanData, Message } from '../types';

// Demo lesson plan for portfolio showcase
export const demoLessonPlan: LessonPlanData = {
  title: "Analyzing Rhetorical Strategies in 'Letter from Birmingham Jail'",
  gradeLevel: "11th Grade",
  subject: "English Language Arts",
  duration: "90 Minutes (Block Period)",
  standard: "CCSS.ELA-LITERACY.RI.11-12.6: Determine an author's point of view or purpose in a text in which the rhetoric is particularly effective, analyzing how style and content contribute to the power, persuasiveness, or beauty of the text.",
  objectives: [
    "Analyze how Dr. King uses ethos, pathos, and logos to build his argument for nonviolent resistance (DOK 3)",
    "Evaluate the effectiveness of King's rhetorical choices in addressing his audience of white moderate clergymen (DOK 3)",
    "Connect King's rhetorical strategies to contemporary social justice movements (DOK 4 Extension)"
  ],
  materials: [
    "Excerpt from 'Letter from Birmingham Jail' (CommonLit)",
    "Rhetorical Appeals Graphic Organizer",
    "Highlighters (3 colors: yellow for ethos, blue for pathos, pink for logos)",
    "Sentence frames handout",
    "Exit slip"
  ],
  procedure: [
    {
      step: "Set Purpose (10 min)",
      description: "Display the quote: 'Injustice anywhere is a threat to justice everywhere.' Ask students to quick-write: What does this mean to you? How might someone convince others to act against injustice? Share out 2-3 responses. Connect to today's objective: We will analyze HOW Dr. King persuades his audience, not just WHAT he argues."
    },
    {
      step: "Modeling (15 min)",
      description: "Teacher reads aloud the first two paragraphs of the letter. Think aloud while annotating: 'I notice King immediately establishes his credibility by mentioning he is the president of the SCLC—that's ethos. He's showing his audience he has authority to speak on this issue.' Model identifying one example each of ethos, pathos, and logos. Students follow along with their own copies, highlighting as teacher models."
    },
    {
      step: "Guided Practice (25 min)",
      description: "Students work in pairs to analyze paragraphs 3-5. Each pair uses the graphic organizer to identify: 1) One example of each rhetorical appeal, 2) The intended effect on the audience, 3) Why this choice is effective for King's purpose. Circulate and use guiding questions: 'What emotion is King trying to evoke here?' 'How does this example build his credibility?' Bring class together to share findings and create anchor chart."
    },
    {
      step: "Independent Practice (30 min)",
      description: "Students independently analyze paragraphs 6-8, completing the graphic organizer. They must identify at least 2 examples of each appeal and write a 3-4 sentence explanation of King's most effective rhetorical move. Early finishers: Begin the DOK 4 extension connecting to a contemporary movement."
    },
    {
      step: "Closure (10 min)",
      description: "Gallery walk: Students post their 'most effective rhetorical move' on the board. Class votes on top 3. Discuss: Why are these moves so powerful? How do they work together? Complete exit slip: Which rhetorical appeal do you find most persuasive and why?"
    }
  ],
  assessment: "Formative: Graphic organizer completion and quality of textual evidence. Summative: Exit slip response demonstrating understanding of rhetorical appeals and their effectiveness.",
  successCriteria: [
    "I can identify examples of ethos, pathos, and logos in King's letter",
    "I can explain WHY a rhetorical choice is effective for King's audience and purpose",
    "I can use textual evidence to support my analysis"
  ],
  supports: {
    all: [
      "Graphic organizer with sentence frames",
      "Color-coded highlighting system",
      "Anchor chart with definitions and examples of rhetorical appeals",
      "Think-pair-share before independent work"
    ],
    el: [
      "Bilingual glossary of key terms (rhetoric, ethos, pathos, logos, persuasion)",
      "Sentence frames: 'King uses [appeal] when he states \"___\" because this shows...'",
      "Audio version of text available via CommonLit",
      "Partner work with strategic pairing"
    ],
    iep504: [
      "Extended time for independent practice",
      "Reduced number of required examples (1 per appeal instead of 2)",
      "Chunked text with paragraph numbers clearly marked",
      "Option to dictate responses using speech-to-text",
      "Preferential seating near anchor chart"
    ]
  },
  equityNotes: "This lesson centers a Black author and the Civil Rights Movement. Consider: How do we honor the weight of this text while teaching analytical skills? Acknowledge the ongoing relevance of King's message. Be prepared to hold space for student emotional responses. Representation tags: #BlackAuthors #CivilRights #SocialJustice #PrimarySource",
  exitSlip: "Which rhetorical appeal (ethos, pathos, or logos) do you find MOST persuasive in King's letter? Cite one specific example from the text and explain why this appeal is effective for King's audience of white moderate clergymen.",
  rubric: [
    { score: 0, description: "No response or off-topic" },
    { score: 1, description: "Identifies an appeal but no textual evidence or explanation" },
    { score: 2, description: "Identifies appeal with evidence but limited explanation of effectiveness" },
    { score: 3, description: "Identifies appeal, cites specific evidence, and explains effectiveness for audience" }
  ],
  textOptions: [
    {
      title: "Letter from Birmingham Jail (Excerpt)",
      source: "CommonLit",
      lexile: "1190L",
      url: "https://www.commonlit.org/en/texts/letter-from-birmingham-jail",
      rationale: "Includes audio support, guided reading mode, and comprehension questions. Appropriate complexity for 11th grade.",
      selected: true
    },
    {
      title: "Letter from Birmingham Jail (Full Text)",
      source: "African Studies Center - UPenn",
      lexile: "1190L",
      url: "https://www.africa.upenn.edu/Articles_Gen/Letter_Birmingham.html",
      rationale: "Full unabridged text for advanced readers or extension activities.",
      selected: false
    },
    {
      title: "The Drum Major Instinct (Sermon)",
      source: "Stanford King Institute",
      lexile: "980L",
      url: "https://kinginstitute.stanford.edu/king-papers/documents/drum-major-instinct-sermon-delivered-ebenezer-baptist-church",
      rationale: "Alternative King text at lower Lexile for differentiation.",
      selected: false
    }
  ],
  teacherModifications: [
    "For shorter periods: Focus on paragraphs 3-5 only; assign 6-8 as homework",
    "For advanced classes: Add comparison to contemporary op-eds or speeches",
    "For struggling readers: Pre-teach vocabulary and provide paragraph summaries",
    "For co-taught classes: Station rotation with teacher-led small group for close reading"
  ]
};

// Demo conversation for portfolio showcase
export const demoMessages: Message[] = [
  {
    id: '1',
    role: 'assistant',
    content: "Hi, I'm Penny. Drop your standard, lesson idea, or teaching dilemma, and I'll ask a few quick questions so we can transform it into rigorous, equitable, UDL-aligned instruction — with zero fluff and maybe one well-placed joke about unrealistic pacing guides.",
    timestamp: new Date(Date.now() - 1000 * 60 * 35)
  },
  {
    id: '2',
    role: 'user',
    content: "I need to teach rhetorical analysis using Letter from Birmingham Jail for my 11th grade ELA class. It's a 90-minute block period. I have several ELs and students with IEPs.",
    timestamp: new Date(Date.now() - 1000 * 60 * 33)
  },
  {
    id: '3',
    role: 'assistant',
    content: "Excellent choice — King's letter is a masterclass in rhetoric, and your students are going to dig into some powerful writing. A few quick questions to make sure we nail this:\n\n1. **What's your main goal?** Are we focusing on identifying rhetorical appeals (ethos, pathos, logos), analyzing their effectiveness, or both?\n\n2. **Your ELs and IEP students:** Any specific accommodations already in place I should build around? (Audio support, extended time, graphic organizers, etc.)\n\n3. **Assessment:** Thinking formative check during class, or does this connect to a larger summative assessment?\n\nAnd because I have to ask — how's your pacing guide looking? Are we working with realistic expectations or the classic 'teach the entire Civil Rights Movement in 45 minutes' situation? 😅",
    timestamp: new Date(Date.now() - 1000 * 60 * 31)
  },
  {
    id: '4',
    role: 'user',
    content: "Both identifying and analyzing effectiveness. My ELs need sentence frames and audio, IEP students need graphic organizers and chunked text. This is formative but leads to a rhetorical analysis essay next week. And yes, the pacing guide is... ambitious. 😂",
    timestamp: new Date(Date.now() - 1000 * 60 * 29)
  },
  {
    id: '5',
    role: 'assistant',
    content: "Got it! Before I build out the full lesson, let's nail down your text selection. Here are **3 options** for accessing King's letter — each with different features for your diverse learners:\n\n---\n\n**📚 Option 1: CommonLit Excerpt** (Recommended)\n- **Lexile:** 1190L\n- **Features:** Built-in audio read-aloud, guided reading mode, comprehension questions, chunked paragraphs\n- **Best for:** Your class mix — audio for ELs, chunking for IEP students\n- 🔗 [commonlit.org/texts/letter-from-birmingham-jail](https://www.commonlit.org/en/texts/letter-from-birmingham-jail)\n\n**📚 Option 2: Full Text (UPenn)**\n- **Lexile:** 1190L  \n- **Features:** Complete unabridged letter, no account required\n- **Best for:** Advanced readers, extension activities\n- 🔗 [africa.upenn.edu](https://www.africa.upenn.edu/Articles_Gen/Letter_Birmingham.html)\n\n**📚 Option 3: The Drum Major Instinct (Alternative)**\n- **Lexile:** 980L (lower complexity)\n- **Features:** Different King text, good for differentiation\n- **Best for:** Struggling readers who need lower Lexile\n- 🔗 [Stanford King Institute](https://kinginstitute.stanford.edu/king-papers/documents/drum-major-instinct-sermon-delivered-ebenezer-baptist-church)\n\n---\n\n**Which text would you like me to build the lesson around?** (You can also use multiple — I'll include all links in the final package for differentiation.)",
    timestamp: new Date(Date.now() - 1000 * 60 * 26)
  },
  {
    id: '6',
    role: 'user',
    content: "Let's go with Option 1 - the CommonLit version. But include the other links for my advanced students.",
    timestamp: new Date(Date.now() - 1000 * 60 * 24)
  },
  {
    id: '7',
    role: 'assistant',
    content: "Perfect choice! CommonLit's audio and chunking features will be clutch for your ELs and IEP students. Here's what I'm building:\n\n**Learning Objectives (DOK 3 + DOK 4 Extension):**\n- Analyze how Dr. King uses ethos, pathos, and logos to build his argument\n- Evaluate the effectiveness of King's rhetorical choices for his specific audience\n- *Extension:* Connect King's strategies to contemporary social justice movements\n\n**Primary Text:** CommonLit excerpt (with audio + guided reading)\n**Extension Texts:** Full letter (UPenn) + Drum Major Instinct for differentiation\n\n**Lesson Structure (5 Phases):**\n1. **Set Purpose** — Quick-write connecting to the essential question\n2. **Modeling** — I Do: Teacher think-aloud with first 2 paragraphs\n3. **Guided Practice** — We Do: Pair work on paragraphs 3-5\n4. **Independent Practice** — You Do: Solo analysis of paragraphs 6-8\n5. **Closure** — Gallery walk + exit slip\n\n**Built-in Supports:**\n- Color-coded highlighting system (yellow=ethos, blue=pathos, pink=logos)\n- Graphic organizer with embedded sentence frames\n- Bilingual glossary for ELs\n- Chunked text with clear paragraph numbers\n- Audio access via CommonLit\n\nShall I finalize this into the full lesson package with all student materials? I'll include the exit slip with a 0-3 rubric that'll give you quick data for your essay unit.",
    timestamp: new Date(Date.now() - 1000 * 60 * 21)
  },
  {
    id: '8',
    role: 'user',
    content: "Yes, please finalize it!",
    timestamp: new Date(Date.now() - 1000 * 60 * 19)
  }
];
