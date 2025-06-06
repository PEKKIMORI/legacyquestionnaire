# Minerva Legacy Questionnaire

A secure, modern web application for conducting personality assessments specifically designed for Minerva University students. This application presents users with a series of questions across different ILO (Intended Learning Outcomes) categories and provides personalized identity assessments based on their responses.

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 with React 18
- **Authentication**: Firebase Auth with Google OAuth integration
- **Database**: Firebase Firestore
- **Styling**: Tailwind CSS with PostCSS
- **Animations**: Framer Motion for smooth transitions
- **Language**: TypeScript with strict type checking
- **Data Processing**: PapaParse for CSV handling
- **Form Components**: Radix UI Select, React Select
- **Security**: Custom middleware, DOMPurify, Validator.js
- **Development**: ESLint, Prettier, TypeScript compiler

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm (comes with Node.js)
- Firebase account and project setup
- Valid Minerva University email address for authentication

## 🔧 Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/legacyquestionnaire.git
   cd legacyquestionnaire
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create a `.env.local` file in the root directory with your Firebase configuration:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
   ```

4. **Firebase Setup**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Authentication (Email/Password and Google providers)
   - Enable Firestore Database
   - Configure Google OAuth with domain restriction to `minerva.edu`
   - Update the Firebase configuration in your `.env.local` file

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
- `npm run build` - Create production build
- `npm run start` - Start production server
- `npm run lint` - Run ESLint for code quality checks

## 🗂️ Project Structure

```
├── public/
│   ├── legacy_questions.csv    # Survey questions data
│   ├── minerva.svg            # Minerva logos and branding
│   ├── minerva1.svg
│   ├── Visual.svg
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── LoginForm.tsx       # Authentication with security features
│   │   ├── Main.tsx           # Landing page component
│   │   ├── ProgressBar.tsx    # Survey progress indicator
│   │   ├── DropdownComponent.tsx # Form select components
│   │   └── PageTransition.tsx  # Animated page transitions
│   ├── pages/
│   │   ├── _app.tsx           # Next.js app configuration
│   │   ├── index.tsx          # Home page
│   │   ├── Final.tsx          # Results page
│   │   ├── api/
│   │   │   └── validate.ts    # Server-side validation API
│   │   └── questions/
│   │       └── [questionId].tsx # Dynamic question pages
│   ├── middleware/
│   │   └── security.ts        # API security middleware
│   ├── utils/
│   │   ├── config.ts          # Environment & security configuration
│   │   └── security.ts        # Input validation & security utilities
│   └── styles/
│       └── globals.css        # Global Tailwind styles
├── firebase.ts                # Firebase configuration & initialization
├── next.config.js             # Next.js configuration with security headers
├── tailwind.config.ts         # Tailwind CSS configuration
├── tsconfig.json              # TypeScript configuration
└── package.json
```

## 📊 Survey Structure

The survey consists of questions organized into five ILO categories:

1. **CR (Civic Responsibility)**
2. **IC (Intercultural Competency)** 
3. **PD (Professional Development)** 
4. **SW (Self-Management and Wellness)** 
5. **IE (Interpersonal Engagement)**

Each question offers 5 multiple-choice options, each aligned with one of the five identity categories (e.g., Civic, Legion, Liberty, North, Tower).

## 🔄 How It Works

1. **Secure Authentication**: 
   - Users authenticate via Firebase Auth with email/password or Google OAuth
   - Domain restriction ensures only Minerva University emails (@minerva.edu, @uni.minerva.edu) can access
   - Rate limiting prevents brute force attacks
   
2. **Question Presentation**: 
   - Questions are dynamically loaded from CSV data using PapaParse
   - Progress tracking with visual indicators
   - Smooth page transitions using Framer Motion
   
3. **Response Collection**: 
   - User responses are validated and sanitized before storage
   - All data is securely stored in Firebase Firestore
   - Input validation prevents XSS and injection attacks
   
4. **Assessment Generation**: 
   - Final personality assessment based on response patterns across ILO categories
   - Results calculated client-side for privacy
   
5. **Results Display**: 
   - Personalized results showing dominant identity traits
   - Visual presentation of assessment outcomes

## 🎨 UI/UX Features

- **Smooth Animations**: Framer Motion provides fluid page transitions and micro-interactions
- **Responsive Design**: Mobile-first approach with Tailwind CSS utilities
- **Modern Glass-morphism UI**: Contemporary design with backdrop blur effects
- **Accessible Components**: Radix UI primitives ensure WCAG compliance
- **Loading States**: Visual feedback during authentication and data processing
- **Error Handling**: User-friendly error messages with security considerations

## 🔒 Security Features

This application implements comprehensive security measures:

### Authentication Security
- **Domain Restriction**: Only Minerva University email addresses are permitted
- **Rate Limiting**: Protection against brute force attacks (5 attempts per 15 minutes)
- **Password Strength**: Enforced strong password requirements for email registration
- **Session Management**: Secure session handling with Firebase Auth

### Input Security
- **XSS Prevention**: All user inputs are sanitized using DOMPurify
- **SQL Injection Protection**: Input validation using Validator.js
- **CSRF Protection**: Cross-Site Request Forgery protection on API endpoints
- **Content Validation**: Server-side validation for all form submissions

### API Security
- **Secure Headers**: Comprehensive security headers including CSP, HSTS, and more
- **CORS Configuration**: Restricted origins for cross-origin requests
- **Request Size Limits**: Protection against large payload attacks
- **Method Validation**: Restricted HTTP methods per endpoint

### Infrastructure Security
- **Environment Variables**: Sensitive configuration stored in environment variables
- **Content Security Policy**: Strict CSP headers to prevent XSS attacks
- **HTTPS Enforcement**: Strict Transport Security headers
- **Frame Protection**: X-Frame-Options to prevent clickjacking

## 🚀 Deployment

The application is optimized for deployment on modern hosting platforms:

### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Configure environment variables in the Vercel dashboard
3. Deploy automatically from your main branch

### Environment Variables for Production
Ensure all required environment variables are set:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` 
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
- `NEXT_PUBLIC_APP_URL` (optional, for enhanced security)
- `NEXT_PUBLIC_ALLOWED_ORIGINS` (optional, comma-separated list)

### Security Considerations for Production
- Enable HTTPS/SSL on your domain
- Configure proper DNS settings
- Set up Firebase security rules
- Monitor application logs for security events
- Regularly update dependencies

## 🧪 Development

### Code Quality
- **TypeScript**: Strict type checking enabled
- **ESLint**: Code linting with Next.js recommended rules
- **Prettier**: Code formatting with Tailwind CSS plugin
- **Environment Validation**: Zod schema validation for environment variables

### Development Workflow
1. Run `npm run dev` for development server
2. Use `npm run lint` to check code quality
3. Test authentication flows with valid Minerva emails
4. Verify security headers in browser developer tools

**Built with ❤️ for Minerva University**
