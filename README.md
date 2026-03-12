# Penny Pedagogy - AI Lesson Plan Generator

An equity-centered AI instructional design partner for high school educators (grades 9-12). Creates rigorous, accessible, UDL-informed lesson plans with embedded accommodations.

![Penny Pedagogy](public/penny-avatar.jpg)

## Features

### 🎯 Core Functionality
- **AI-Powered Lesson Design**: Chat with Penny to collaboratively design lesson plans
- **Equity-Centered Approach**: Built-in supports for EL students and IEP/504 accommodations
- **UDL-Informed**: Universal Design for Learning principles embedded throughout
- **DOK Level Tagging**: Automatic Depth of Knowledge level detection and display

### 📄 Print Package
- **Complete Lesson Plan**: Objectives, materials, 5-phase procedure, assessment
- **Student Materials**: Exit slip, graphic organizer, sentence frames
- **Text Sources**: QR codes and hyperlinks to reading materials with audio support
- **Teacher Guide**: How to use the lesson pack, modification options

### 🎨 Design
- Vintage newspaper aesthetic with modern functionality
- Light/Dark theme toggle ("Morning Mode" / "Coffee Break")
- Responsive design for desktop and mobile
- Smooth animations and transitions

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **State Management**: Zustand with persistence
- **AI Integration**: Poe API (Claude Sonnet 4.5)
- **UI Components**: Radix UI, Lucide Icons
- **PDF Generation**: react-to-print with QR codes

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
POE_API_KEY=your_poe_api_key_here
POE_BOT_NAME=Penny_Pedagogy_v1.0
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Demo Mode

Click the "View Demo" button to see a pre-populated example lesson plan for portfolio showcase.

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── api/chat/          # Poe API integration
│   ├── layout.tsx         # Root layout with meta tags
│   └── page.tsx           # Main application page
├── src/
│   ├── app/components/    # React components
│   │   ├── ChatInterface.tsx
│   │   ├── LessonPlan.tsx # Printable lesson plan
│   │   └── PennyFrame.tsx # Avatar component
│   ├── data/              # Demo data and defaults
│   ├── lib/               # Utilities and parsers
│   ├── store/             # Zustand state management
│   ├── styles/            # Global CSS
│   └── types/             # TypeScript definitions
└── public/                # Static assets
```

## Lesson Plan Output

Each generated lesson plan includes:

1. **Learning Objectives** with DOK level indicators
2. **Success Criteria** for student self-assessment
3. **Text Selection** with 3 options and source links
4. **5-Phase Procedure**: Set Purpose → Modeling → Guided Practice → Independent Practice → Closure
5. **Supports & Scaffolds** by learner lane (All/EL/IEP-504)
6. **Equity Notes** with representation tags
7. **Exit Slip** with 0-3 rubric
8. **Teacher Modification Options**

## Credits

- Design inspired by vintage newspaper aesthetics
- Built with ❤️ for educators who believe in equity and access
- Original Figma design: [Lesson Plan Chatbot Design](https://www.figma.com/design/nMuSDKhCn65UddXwKc9Zx9/Lesson-Plan-Chatbot-Design)

## License

MIT
  