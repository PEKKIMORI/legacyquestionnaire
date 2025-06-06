# Minerva Identity Survey - Legacy Questionnaire

A modern, interactive web application for conducting personality assessments. This application presents users with a series of questions across different ILO () categories and provides personalized identity assessments.

## 🛠️ Tech Stack

- **Frontend**: Next.js 14 with React 18
- **Authentication**: Firebase Auth
- **Database**: Firebase Firestore
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Language**: TypeScript
- **Data Processing**: PapaParse for CSV handling
- **UI Components**: Radix UI components

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Firebase account and project setup

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/legacyquestionnaire.git
   cd legacyquestionnaire
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Firebase Setup**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Authentication and Firestore
   - Update the Firebase configuration in `firebase.ts` with your project credentials

4. **Environment Setup**
   - Ensure your Firebase configuration is properly set up in `firebase.ts`
   - The application uses Firebase for both authentication and data storage

## 🚀 Running the Application

### Development Mode
```bash
npm run dev
```
The application will be available at `http://localhost:3000`

### Production Build
```bash
npm run build
npm start
```

### Other Available Scripts
- `npm run lint` - Run ESLint
- `npm run db:studio` - Open Prisma Studio (if using Prisma)
- `npm run db:push` - Push database schema changes

## 🗂️ Project Structure

```
├── public/
│   ├── legacy_questions.csv    # Survey questions data
│   ├── minerva.svg            # Minerva logo
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── LoginForm.tsx      # Authentication component
│   │   ├── Main.tsx           # Landing page component
│   │   ├── ProgressBar.tsx    # Survey progress indicator
│   │   └── DropdownComponent.tsx
│   ├── pages/
│   │   ├── index.tsx          # Home page
│   │   ├── Final.tsx          # Results page
│   │   ├── FinalDetails.tsx   # Detailed results
│   │   └── questions/
│   │       └── [questionId].tsx # Dynamic question pages
│   └── styles/
│       └── globals.css        # Global styles
├── firebase.ts                # Firebase configuration
├── package.json
└── README.md
```

## 📊 Survey Structure

The survey consists of questions organized into five ILO categories:

1. **CR ()**
2. **IR ()** 
3. **PR ()** 
4. **SW ()** 
5. **IE ()**

Each question offers 5 multiple-choice options, each aligned with one of the five identity categories (e.g., Civic, Legion, Liberty, North, Tower).

## 🔄 How It Works

1. **User Authentication**: Users log in through Firebase Auth
2. **Question Presentation**: Questions are dynamically loaded from CSV data
3. **Response Collection**: User responses are stored in Firestore
4. **Progress Tracking**: Visual progress bar updates as users complete sections
5. **Assessment Generation**: Final personality assessment based on response patterns
6. **Results Display**: Personalized results showing dominant identity traits

## 🎨 UI/UX Features

- **Smooth Animations**: Framer Motion provides fluid page transitions
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Modern Glass-morphism**: Contemporary UI with backdrop blur effects
- **Intuitive Navigation**: Clear progress indicators and navigation flow
- **Accessibility**: Built with accessibility best practices

## 🔒 Data Security

- Firebase Authentication ensures secure user sessions
- All user responses are stored securely in Firestore
- No sensitive personal information is collected beyond authentication

## 🚀 Deployment

The application is configured for deployment on Vercel or similar platforms that support Next.js:

1. Connect your repository to your deployment platform
2. Set up environment variables for Firebase configuration
3. Deploy directly from your main branch

**Built with ❤️ for Minerva University**