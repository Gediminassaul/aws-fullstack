import React, { useState, useEffect } from 'react';
import '@aws-amplify/ui-react/styles.css';
import { withAuthenticator, Button, View } from '@aws-amplify/ui-react';
import { fetchAuthSession } from '@aws-amplify/auth';

function App({ signOut }) {
  const [sessionDetails, setSessionDetails] = useState({});

  useEffect(() => {
    async function getSessionDetails() {
      try {
        const sessionData = await fetchAuthSession();
        console.log(sessionData);
        console.log(sessionData.userSub);
        setSessionDetails({ sub: sessionData.userSub });
      } catch (error) {
        console.error('Error getting session details', error);
      }
    }

    getSessionDetails();
  }, []);

  return (
    <View className="App">
      <div style={{ position: 'absolute', top:   0, right:   0, padding: '1rem' }}>
        {sessionDetails.sub && (
          <span>Sub: {sessionDetails.sub}</span>
        )}
        <Button onClick={signOut}>Sign Out</Button>
      </div>
    </View>
  );
}

export default withAuthenticator(App);