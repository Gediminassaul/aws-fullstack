import "@aws-amplify/ui-react/styles.css";
import {
  withAuthenticator, 
  Button,
  View,
} from "@aws-amplify/ui-react";
function App({ signOut }) {
  return(
    <View className="App">
      <Button onClick={signOut}>Sign Out</Button>
    </View>
  );
}
export default withAuthenticator (App);