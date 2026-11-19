import { useAuth } from './auth-context.js'
import {
  ConfigErrorScreen,
  LoadingScreen,
  NotAuthorisedScreen,
  OwnerSetupScreen,
  SignInScreen,
} from './AuthScreens.jsx'

// Shows the app only to active family members; everyone else sees the right sign-in screen.
// This is for the user experience; the real protection is in firestore.rules.
export default function AuthGate({ children }) {
  const { status } = useAuth()
  switch (status) {
    case 'ready':
      return children
    case 'configError':
      return <ConfigErrorScreen />
    case 'signedOut':
      return <SignInScreen />
    case 'needsSetup':
      return <OwnerSetupScreen />
    case 'notAuthorised':
      return <NotAuthorisedScreen />
    default:
      return <LoadingScreen />
  }
}
