# Penny Pedagogy Lesson Plan Generator - Build Log

**Project:** Lessonplanchatbotdesign  
**Date:** February 17, 2026  
**Version:** 1.0.0  

---

## Overview

Penny Pedagogy is an equity-centered AI instructional design partner for high school educators (grades 9-12). This build migrates the application from Vite to Next.js 14 and integrates the Poe API for AI-powered lesson plan generation.

---

## Build Sessions Summary

### Session 1-3: Foundation & Migration
- **Framework Migration:** Vite → Next.js 14 with App Router
- **API Integration:** Poe API (OpenAI-compatible endpoint) with streaming SSE
- **State Management:** Zustand with localStorage persistence
- **Styling:** Tailwind CSS v3 with custom vintage/modern aesthetic

### Session 4: Bug Fixes & Enhancements
- **Fixed:** JSON parsing error from corrupted Next.js cache
- **Fixed:** Hyperlinks not clickable in chat (added react-markdown)
- **Fixed:** Lorem ipsum placeholder text replaced with dynamic content
- **Fixed:** PDF print cutoffs (added CSS page breaks)
- **Fixed:** `msg.timestamp.toLocaleTimeString` error (timestamp serialization)
- **Fixed:** Hyperlinks not clickable in LessonPlan view
- **Added:** QR codes for text sources (qrcode.react)

### Session 5: Layout & Usability Improvements
- **Improved:** Procedure section formatting with FormattedText helper
- **Added:** "How to Use This Lesson Pack" reference page
- **Added:** Reading Passage placeholder page for teachers
- **Added:** Penny Pedagogy avatar image

---

## Technical Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v3 |
| State | Zustand + localStorage |
| AI Backend | Poe API (Claude Sonnet 4.5) |
| Markdown | react-markdown |
| QR Codes | qrcode.react |
| Icons | Lucide React |

---

## Key Features

### Chat Interface
- Real-time streaming responses from Penny
- Markdown rendering with clickable hyperlinks
- Message history with timestamps
- "New Conversation" reset button
- Lesson plan extraction from AI responses

### Lesson Plan Viewer
- Structured sections matching Penny's output format
- Print-optimized layout with page breaks
- QR codes for digital text access
- Vintage/modern aesthetic design

### Lesson Plan Sections
1. **Header:** Title, Grade Level, Subject, Duration, Standard
2. **Objectives:** Learning goals with DOK levels
3. **Success Criteria:** Student-facing checkpoints
4. **Materials:** Checklist format
5. **Supports & Scaffolds:** All Students / EL / IEP-504
6. **Procedure:** 5-phase lesson flow with formatted steps
7. **Assessment:** Exit slip with rubric
8. **Equity Notes:** Representation tags
9. **Teacher Modifications:** Adaptation suggestions
10. **Text Selection:** 3 options with URLs

### Print Package (Student Materials)
1. **Exit Slip Worksheet** - With 0-3 rubric
2. **Graphic Organizer** - Visual thinking tool
3. **Sentence Frames** - Writing scaffolds
4. **Text Sources** - QR codes for digital access
5. **How to Use Guide** - Account requirements (CommonLit, Newsela, etc.)
6. **Reading Passage Placeholder** - For teacher-attached text

---

## File Structure

```
Lessonplanchatbotdesign/
├── app/
│   ├── api/chat/route.ts      # Poe API endpoint
│   ├── layout.tsx             # Root layout
│   └── page.tsx               # Main page
├── public/
│   └── penny-avatar.jpg       # Penny Pedagogy image
├── src/
│   ├── app/components/
│   │   ├── ChatInterface.tsx  # Chat UI with markdown
│   │   ├── LessonPlan.tsx     # Full lesson plan renderer
│   │   └── PennyFrame.tsx     # Avatar frame component
│   ├── data/
│   │   └── defaults.ts        # Default lesson plan data
│   ├── lib/
│   │   ├── lessonPlanParser.ts # JSON extraction from AI
│   │   └── utils.ts           # Utility functions
│   ├── store/
│   │   └── useStore.ts        # Zustand state management
│   ├── styles/
│   │   ├── globals.css        # Tailwind imports
│   │   └── index.css          # Custom styles
│   └── types/
│       └── index.ts           # TypeScript interfaces
├── .env.example               # Environment template
├── .gitignore                 # Git ignore rules
├── next.config.js             # Next.js configuration
├── package.json               # Dependencies
├── postcss.config.js          # PostCSS config
├── tailwind.config.js         # Tailwind config
└── tsconfig.json              # TypeScript config
```

---

## Environment Variables

```env
POE_API_KEY=your_poe_api_key_here
```

---

## Running the Application

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

---

## Known Issues / Future Considerations

1. **Text Extraction:** Cannot automatically extract copyrighted text from CommonLit/Newsela for hard copies. Reading Passage placeholder page provided as workaround.

2. **Webpack Cache Warnings:** Occasional cache file rename errors during development (non-blocking).

3. **TypeScript Lint Warnings:** Minor type issues in `lessonPlanParser.ts` (functional, non-breaking).

---

## Git Commit History

```
5bd284b feat: Next.js migration with Poe API integration and enhanced lesson plan features
```

---

## Credits

- **AI Model:** Penny Pedagogy v1.0 (Claude Sonnet 4.5 via Poe)
- **Design:** Vintage modern aesthetic with Oswald typography
- **Framework:** Next.js by Vercel

---

*Build log generated February 17, 2026*
