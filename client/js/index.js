// --- index.js (Frontend Room Membership Check) ---

document.addEventListener('DOMContentLoaded', () => {
  // --- Existing Variables ---
  const userIcon = document.getElementById('user-icon');
  const dropdownContent = document.getElementById('dropdown-content');
  const logoutLink = document.getElementById('logout-link');
  const joinRoomBtn = document.getElementById('join-room-btn');
  const quickCreateRoomBtn = document.getElementById('quick-create-room-btn');
  const joinError = document.getElementById('join-error');
  const createError = document.getElementById('create-error');

  // --- Dropdown Session Elements (Keep if needed, but list is now primary) ---
  const activeSessionsLinkDropdown = document.getElementById('active-sessions-link-dropdown');
  const activeSessionsPanelDropdown = document.querySelector('.active-sessions-panel');
  const mySessionsLinkDropdown = document.getElementById('my-sessions-link-dropdown');
  const mySessionsPanelDropdown = document.querySelector('.my-sessions-panel');

  // --- Tab Elements ---
  const tabControls = document.querySelector('.tab-controls');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const openSessionsBody = document.getElementById('open-sessions-body');
  const mySessionsBody = document.getElementById('my-sessions-body');
  const historyBody = document.getElementById('history-body'); // For future use
  const noOpenSessionsMsg = document.getElementById('no-open-sessions-msg');
  const noMySessionsMsg = document.getElementById('no-my-sessions-msg');
  const noHistoryMsg = document.getElementById('no-history-msg'); // For future use
  const historyPlaceholder = document.getElementById('history-placeholder'); // Placeholder text

  if (!isLoggedIn()) {
      redirectTo('auth.html');
      return;
  }

  const username = getUsername();
  if (username) {
      userIcon.textContent = username.charAt(0).toUpperCase();
  }

  // --- Existing User Menu Logic ---
  userIcon.addEventListener('click', () => {
      dropdownContent.classList.toggle('show');
  });

  logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      clearAccessToken();
      clearUsername();
      redirectTo('auth.html');
  });

  window.addEventListener('click', (event) => {
    if (!event.target.matches('.user-icon')) {
      let targetElement = event.target;
      while (targetElement) {
        if (targetElement.classList && targetElement.classList.contains('dropdown-content')) {
          return;
        }
        targetElement = targetElement.parentNode;
      }
      if (dropdownContent.classList.contains('show')) {
        dropdownContent.classList.remove('show');
      }
    }
  });

  // --- Helper function to check if a user is in a room ---
  async function isUserInRoom(roomId, userId) {
      try {
          // Optimization: Maybe fetch room details only if needed,
          // or perhaps the /rooms/active and /rooms/my endpoints
          // could include a flag indicating if the current user is a member.
          // For now, keep the separate fetch.
          const response = await authFetch(`/rooms/${roomId}`);
          if (!response.ok) {
               // If room fetch fails (e.g., 404), user is not in it.
              if (response.status === 404) return false;
              console.error(`Failed to fetch room data ${roomId}: ${response.status}`);
              return false; // Assume not in room on other errors
          }
          const roomData = await response.json();
          return roomData.users.some(user => user.id === userId);
      } catch (error) {
          console.error('Error checking if user is in room:', error);
          return false; // Assume not in room on network errors
      }
  }

    // --- Modified joinRoomBtn event listener ---
    joinRoomBtn.addEventListener('click', async () => {
      // Reset error state VISUALLY and clear text
      joinError.textContent = '';
      joinError.style.display = 'none'; // Added line: Hide error initially

      const code = document.getElementById('join-room-code').value.trim();
      if (!code) {
          joinError.textContent = 'Please enter a room code.';
          joinError.style.display = 'flex'; // Added line: Show error
          return;
      }

      try {
          // --- Original Logic (simplified for clarity of error handling) ---
          const roomsResponse = await authFetch('/rooms/active');
          if (!roomsResponse.ok) throw new Error(`Failed to fetch active rooms: ${roomsResponse.status}`);
          const rooms = await roomsResponse.json();
          const room = rooms.find(r => r.code === code);

          if (!room) {
               console.log(`Room code ${code} not in active list, attempting direct join...`);
               // Fall through to direct join attempt below
          } else {
               const roomId = room.id;
               const userId = parseInt(parseJwt(getAccessToken()).user_id);
               const alreadyInRoom = await isUserInRoom(roomId, userId);
               if (alreadyInRoom) {
                   redirectTo(`session.html?room_id=${roomId}`);
                   return; // Already handled
               }
               // Fall through to join attempt
          }

           // --- Attempt to Join ---
          const joinResponse = await authFetch('/rooms/join', {
              method: 'POST',
              body: JSON.stringify({ code }),
          });

          if (joinResponse.ok) {
              const joinData = await joinResponse.json();
              redirectTo(`session.html?room_id=${joinData.room_id}`);
          } else {
              const errorData = await joinResponse.json();
               // Handle specific errors
               if (joinResponse.status === 404) {
                   joinError.textContent = 'Room not found.';
                   joinError.style.display = 'flex'; // Added line: Show error
               } else if (joinResponse.status === 403 && errorData.message.includes("already a member")) {
                   console.warn("Backend indicated already a member via 403. Trying to find room ID again.");
                    const roomsResponseRetry = await authFetch('/rooms/active'); // Or check /rooms/my ?
                     if (roomsResponseRetry.ok) {
                        const roomsRetry = await roomsResponseRetry.json();
                        const roomRetry = roomsRetry.find(r => r.code === code);
                        if (roomRetry) {
                             redirectTo(`session.html?room_id=${roomRetry.id}`);
                             return;
                         }
                     }
                     // If still can't find, show generic error
                     joinError.textContent = errorData.message || 'Could not join room (already member?).';
                     joinError.style.display = 'flex'; // Added line: Show error

               } else if (joinResponse.status === 403){
                   joinError.textContent = errorData.message || 'Cannot join room (perhaps full?).';
                   joinError.style.display = 'flex'; // Added line: Show error
               }
               else {
                  // Use the errorData message or construct a default one
                  const errorMessage = errorData.message || `Failed to join room: ${joinResponse.status}`;
                  joinError.textContent = errorMessage;
                  joinError.style.display = 'flex'; // Added line: Show error
                  // Optionally re-throw if you want the catch block below to also handle it
                  // throw new Error(errorMessage);
               }
          }

      } catch (error) {
          // General catch block error handling
          joinError.textContent = error.message;
          joinError.style.display = 'flex'; // Added line: Show error
          console.error('Error joining room:', error);
      }
  });

    // --- Quick Create Room ---
    quickCreateRoomBtn.addEventListener('click', async () => {
      // Reset error state VISUALLY and clear text
      createError.textContent = '';
      createError.style.display = 'none'; // Added line: Hide error initially

      try {
          const randomName = "Room-" + Math.random().toString(36).substring(2, 8).toUpperCase();
          const maxUsers = 10;

          const response = await authFetch('/rooms/create', {
              method: 'POST',
              body: JSON.stringify({ name: randomName, max_users: maxUsers }),
          });

          if (!response.ok) {
              const errorData = await response.json();
              // Throw error to be caught by the catch flex
              throw new Error(errorData.message || `Failed to create room: ${response.status}`);
          }

          const data = await response.json();
          redirectTo(`session.html?room_id=${data.room_id}`);

      } catch (error) {
          // General catch flex error handling
          createError.textContent = error.message;
          createError.style.display = 'flex'; // Added line: Show error
          console.error('Error creating room:', error);
      }
  });


  // --- Function to Render Session List ---
  async function renderSessionList(sessions, targetBodyElement, noSessionsMsgElement) {
      targetBodyElement.innerHTML = ''; // Clear previous list
      noSessionsMsgElement.style.display = 'none'; // Hide 'no sessions' message initially
      targetBodyElement.parentElement.querySelector('.sessions-list-header').style.display = 'none'; // Hide header initially


      if (!sessions || sessions.length === 0) {
          noSessionsMsgElement.style.display = 'block'; // Show message
          return;
      }

       targetBodyElement.parentElement.querySelector('.sessions-list-header').style.display = 'flex'; // Show header

      const userId = parseInt(parseJwt(getAccessToken()).user_id);

      // Use Promise.all to fetch membership status concurrently (optional optimization)
      const sessionPromises = sessions.map(async (session) => {
          const alreadyInRoom = await isUserInRoom(session.id, userId);
          return { ...session, alreadyInRoom }; // Add membership info to session object
      });

      const sessionsWithMembership = await Promise.all(sessionPromises);


      sessionsWithMembership.forEach(session => {
          const sessionElement = document.createElement('div');
          sessionElement.classList.add('session-row-item');

          const codeElement = document.createElement('span');
          // Display code - maybe name is better? Let's use name for now.
          // codeElement.textContent = session.code; // Or session.name
          codeElement.textContent = session.name; // Display Name instead of code
          codeElement.title = `Code: ${session.code}`; // Show code on hover

          const usersElement = document.createElement('span');
          usersElement.textContent = `${session.current_users}/${session.max_users}`;

          const actionElement = document.createElement('div'); // Wrapper for button

          const joinButton = document.createElement('button');
          joinButton.dataset.roomId = session.id;
          joinButton.dataset.roomCode = session.code; // Store code for joining
          joinButton.textContent = session.alreadyInRoom ? 'Enter' : 'Join';

          joinButton.addEventListener('click', async (e) => {
               const btn = e.target;
               const roomIdToJoin = btn.dataset.roomId;
               const roomCodeToJoin = btn.dataset.roomCode;
               const isMember = btn.textContent === 'Enter'; // Check current button text

              if (isMember) {
                  redirectTo(`session.html?room_id=${roomIdToJoin}`);
              } else {
                  // Attempt to join
                  try {
                      const joinResponse = await authFetch('/rooms/join', {
                          method: 'POST',
                          body: JSON.stringify({ code: roomCodeToJoin }),
                      });

                      if (joinResponse.ok) {
                          const joinData = await joinResponse.json();
                          redirectTo(`session.html?room_id=${joinData.room_id}`);
                      } else {
                          const errorData = await joinResponse.json();
                          console.error('Error joining room from list:', errorData.message);
                          alert(`Failed to join: ${errorData.message}`); // Simple alert for list join error
                      }
                  } catch (joinError) {
                      console.error('Error joining room from list:', joinError);
                      alert(`Error joining room: ${joinError.message}`);
                  }
              }
          });

          actionElement.appendChild(joinButton);

          sessionElement.appendChild(codeElement);
          sessionElement.appendChild(usersElement);
          sessionElement.appendChild(actionElement); // Append the div containing the button
          targetBodyElement.appendChild(sessionElement);
      });
  }


  // --- Functions to Load Data for Each Tab ---
  async function loadOpenSessions() {
      console.log("Loading Open Sessions...");
      openSessionsBody.innerHTML = '<p style="text-align: center; padding: 10px;">Loading...</p>'; // Loading indicator
      noOpenSessionsMsg.style.display = 'none';
      try {
          const response = await authFetch('/rooms/active');
          if (!response.ok) throw new Error(`Failed to fetch active rooms: ${response.status}`);
          const sessions = await response.json();
          await renderSessionList(sessions, openSessionsBody, noOpenSessionsMsg);
      } catch (error) {
          console.error('Error fetching active sessions:', error);
          openSessionsBody.innerHTML = ''; // Clear loading
          noOpenSessionsMsg.textContent = `Error loading sessions: ${error.message}`;
          noOpenSessionsMsg.style.display = 'block';
      }
  }

  async function loadMySessions() {
      console.log("Loading My Sessions...");
      mySessionsBody.innerHTML = '<p style="text-align: center; padding: 10px;">Loading...</p>'; // Loading indicator
      noMySessionsMsg.style.display = 'none';
      try {
          const response = await authFetch('/rooms/my');
          if (!response.ok) throw new Error(`Failed to fetch my rooms: ${response.status}`);
          const sessions = await response.json();
           await renderSessionList(sessions, mySessionsBody, noMySessionsMsg);
      } catch (error) {
          console.error('Error fetching my sessions:', error);
           mySessionsBody.innerHTML = ''; // Clear loading
          noMySessionsMsg.textContent = `Error loading sessions: ${error.message}`;
          noMySessionsMsg.style.display = 'block';
      }
  }

  async function loadHistorySessions() {
      console.log("Loading History Sessions...");
      historyBody.innerHTML = ''; // Clear previous
      noHistoryMsg.style.display = 'none';
      historyPlaceholder.style.display = 'block'; // Show placeholder/message
      historyBody.parentElement.querySelector('.sessions-list-header').style.display = 'none'; // Hide header

      // TODO: Implement History Fetching
      // try {
      //     const response = await authFetch('/rooms/history'); // Needs backend endpoint
      //     if (!response.ok) throw new Error(`Failed to fetch history: ${response.status}`);
      //     const sessions = await response.json();
      //      await renderSessionList(sessions, historyBody, noHistoryMsg);
      //      historyPlaceholder.style.display = 'none'; // Hide placeholder on success
      // } catch (error) {
      //     console.error('Error fetching history sessions:', error);
      //     historyBody.innerHTML = '';
      //     noHistoryMsg.textContent = `Error loading history: ${error.message}`;
      //     noHistoryMsg.style.display = 'block';
      //     historyPlaceholder.style.display = 'none'; // Hide placeholder on error
      // }
  }


  // --- Tab Switching Logic ---
  tabControls.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-button')) {
          const targetTab = e.target.dataset.tab;

          // Remove active class from all buttons and panes
          tabControls.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
          tabPanes.forEach(pane => pane.classList.remove('active'));

          // Add active class to the clicked button and corresponding pane
          e.target.classList.add('active');
          const targetPane = document.getElementById(`${targetTab}-content`);
          if (targetPane) {
              targetPane.classList.add('active');

              // Load data for the newly activated tab
              switch (targetTab) {
                  case 'open-sessions':
                      loadOpenSessions();
                      break;
                  case 'my-sessions':
                      loadMySessions();
                      break;
                  case 'history':
                      loadHistorySessions();
                      break;
              }
          } else {
              console.error("Could not find target pane for tab:", targetTab);
          }
      }
  });

  // --- Initial Load for Default Tab ---
  // Find the initially active tab and load its content
  const initiallyActiveButton = tabControls.querySelector('.tab-button.active');
  if (initiallyActiveButton) {
      const initialTab = initiallyActiveButton.dataset.tab;
      switch (initialTab) {
          case 'open-sessions':
              loadOpenSessions();
              break;
          case 'my-sessions':
              loadMySessions();
              break;
          case 'history':
              loadHistorySessions();
              break;
      }
  } else {
      // Default to loading open sessions if none is marked active
      loadOpenSessions();
  }


   // --- Dropdown Link Handling (Optional: Could trigger tab switch) ---
   // You might want these links to switch the tab and scroll down,
   // or keep their original panel-showing behavior.
   // Example: Make dropdown link switch the main tab
   activeSessionsLinkDropdown.addEventListener('click', (e) => {
       e.preventDefault();
       // Find the button for open sessions and click it programmatically
       const openSessionsButton = tabControls.querySelector('button[data-tab="open-sessions"]');
       if (openSessionsButton) {
           openSessionsButton.click(); // This will trigger the tab switch and data load
           // Optional: scroll to the list
           document.querySelector('.room-options-list').scrollIntoView({ behavior: 'smooth' });
       }
        // Close dropdown after click
        dropdownContent.classList.remove('show');
   });

   mySessionsLinkDropdown.addEventListener('click', (e) => {
        e.preventDefault();
       const mySessionsButton = tabControls.querySelector('button[data-tab="my-sessions"]');
       if (mySessionsButton) {
           mySessionsButton.click();
           document.querySelector('.room-options-list').scrollIntoView({ behavior: 'smooth' });
       }
        dropdownContent.classList.remove('show');
   });


}); // End DOMContentLoaded

// --- Utility for JWT (Keep as is) ---
function parseJwt(token) {
  try {
      var base64Url = token.split('.')[1];
      var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
  } catch (e) {
      console.error("Error parsing JWT:", e);
      // Return a default structure or null if parsing fails
      // This helps prevent errors later if the token is invalid
      return { user_id: null };
  }
}