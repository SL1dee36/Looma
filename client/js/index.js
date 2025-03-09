// --- index.js (Frontend Room Membership Check) ---

document.addEventListener('DOMContentLoaded', () => {
  const userIcon = document.getElementById('user-icon');
  const dropdownContent = document.getElementById('dropdown-content');
  const logoutLink = document.getElementById('logout-link');

  const joinRoomBtn = document.getElementById('join-room-btn');
  const createRoomBtn = document.getElementById('create-room-btn');
  const joinError = document.getElementById('join-error');
  const createError = document.getElementById('create-error');

  const activeSessionsLink = document.getElementById('active-sessions-link');
  const activeSessionsPanel = document.querySelector('.active-sessions-panel');
  const mySessionsLink = document.getElementById('my-sessions-link');
  const mySessionsPanel = document.querySelector('.my-sessions-panel');

  if (!isLoggedIn()) {
      redirectTo('auth.html');
      return;
  }

  const username = getUsername();
  if (username) {
      userIcon.textContent = username.charAt(0).toUpperCase();
  }

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
          const response = await authFetch(`/rooms/${roomId}`);
          if (!response.ok) {
              throw new Error(`Failed to fetch room data: ${response.status}`);
          }
          const roomData = await response.json();

           // Check if the user ID is in the room's users array
          return roomData.users.some(user => user.id === userId);

      } catch (error) {
          console.error('Error checking if user is in room:', error);
          // In case of an error, assume the user is not in the room (to be safe)
          return false;
      }
  }

// --- Modified joinRoomBtn event listener ---
  joinRoomBtn.addEventListener('click', async () => {
    joinError.textContent = '';
    const code = document.getElementById('join-room-code').value;
    if (!code) {
      joinError.textContent = 'Please enter a room code.';
      return;
    }

    try {
      // First, find the room by code to get its ID.
      const roomsResponse = await authFetch('/rooms/active');
      if (!roomsResponse.ok) {
        throw new Error(`Failed to fetch active rooms: ${roomsResponse.status}`);
      }
      const rooms = await roomsResponse.json();
      const room = rooms.find(r => r.code === code);

      if (!room) {
        joinError.textContent = 'Room not found.';
        return;
      }

      const roomId = room.id;
      const userId = parseInt(parseJwt(getAccessToken()).user_id);

      // Check if the user is already in the room.
      const alreadyInRoom = await isUserInRoom(roomId, userId);

      if (alreadyInRoom) {
        // If already in the room, redirect directly.
        redirectTo(`session.html?room_id=${roomId}`);
      } else {
        // If not in the room, attempt to join.
        const joinResponse = await authFetch('/rooms/join', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });

        if (joinResponse.ok) {
          const joinData = await joinResponse.json();
          redirectTo(`session.html?room_id=${joinData.room_id}`);
        } else {
            const errorData = await joinResponse.json();
            throw new Error(errorData.message);
        }
      }
    } catch (error) {
      joinError.textContent = error.message;
      console.error('Error joining room:', error);
    }
  });

  createRoomBtn.addEventListener('click', async () => {
      createError.textContent = '';
      const name = document.getElementById('create-room-name').value;
      const max_users = document.getElementById('create-room-capacity').value;
      if (!max_users) {
          createError.textContent = "Please, set max users";
          return;
      }
      try {
          const response = await authFetch('/rooms/create', { // Use authFetch
              method: 'POST',
              body: JSON.stringify({ name, max_users }),
          });
          const data = await response.json();
          redirectTo(`session.html?room_id=${data.room_id}`);
      } catch (error) {
          createError.textContent = error.message;
      }
  });
  // --- Active Sessions ---
  activeSessionsLink.addEventListener('click', async (e) => {
  e.preventDefault();
  activeSessionsPanel.innerHTML = '';
  activeSessionsPanel.style.display = 'block';
  mySessionsPanel.style.display = 'none';

  try {
    const response = await authFetch('/rooms/active');
    if (!response.ok) {
      throw new Error(`Failed to fetch active rooms: ${response.status}`);
    }
    const sessions = await response.json();

    if (sessions.length === 0) {
      activeSessionsPanel.innerHTML = '<p>No active sessions found.</p>';
      return;
    }

    const userId = parseInt(parseJwt(getAccessToken()).user_id); // Get current user ID

    for (const session of sessions) {
      const sessionElement = document.createElement('div');
      sessionElement.classList.add('session-item');

      const nameElement = document.createElement('span');
      nameElement.textContent = session.name;
      sessionElement.appendChild(nameElement);

      const usersElement = document.createElement('span');
      usersElement.textContent = ` (${session.current_users}/${session.max_users})`;
      sessionElement.appendChild(usersElement);

      const joinButton = document.createElement('button');
      joinButton.textContent = 'Join';
      joinButton.dataset.roomId = session.id;

      // Check if the user is already in the room *before* adding the event listener
      const alreadyInRoom = await isUserInRoom(session.id, userId);

      if (alreadyInRoom) {
        joinButton.textContent = 'Enter'; // Change button text for clarity
      }

      joinButton.addEventListener('click', async () => {
        if (alreadyInRoom) {
          redirectTo(`session.html?room_id=${session.id}`);
        } else {
          try {
            const joinResponse = await authFetch('/rooms/join', {
              method: 'POST',
              body: JSON.stringify({ code: session.code }),
            });

            if (joinResponse.ok) {
              const joinData = await joinResponse.json();
              redirectTo(`session.html?room_id=${joinData.room_id}`);
            } else {
              const errorData = await joinResponse.json();
              throw new Error(errorData.message);
            }
          } catch (joinError) {
            console.error('Error joining room:', joinError);
            joinError.textContent = joinError.message; // Display error
          }
        }
      });

      sessionElement.appendChild(joinButton);
      activeSessionsPanel.appendChild(sessionElement);
    }
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    activeSessionsPanel.innerHTML = `<p>Error: ${error.message}</p>`;
  }
});

  // --- My Sessions ---
 mySessionsLink.addEventListener('click', async (e) => {
  e.preventDefault();
  mySessionsPanel.innerHTML = '';
  mySessionsPanel.style.display = 'block';
  activeSessionsPanel.style.display = 'none';

  try {
    const response = await authFetch('/rooms/my');
    if (!response.ok) {
      throw new Error(`Failed to fetch my rooms: ${response.status}`);
    }
    const sessions = await response.json();

    if (sessions.length === 0) {
      mySessionsPanel.innerHTML = '<p>You have not created any sessions.</p>';
      return;
    }

    const userId = parseInt(parseJwt(getAccessToken()).user_id); // Get current user ID

    for (const session of sessions) {
      const sessionElement = document.createElement('div');
      sessionElement.classList.add('session-item');

      const nameElement = document.createElement('span');
      nameElement.textContent = session.name;
      sessionElement.appendChild(nameElement);

      const usersElement = document.createElement('span');
      usersElement.textContent = ` (${session.current_users}/${session.max_users})`;
      sessionElement.appendChild(usersElement);

      const joinButton = document.createElement('button');
      joinButton.textContent = 'Join';
      joinButton.dataset.roomId = session.id;

      // --- Check user membership BEFORE adding the event listener ---
      const alreadyInRoom = await isUserInRoom(session.id, userId);
      if(alreadyInRoom){
          joinButton.textContent = 'Enter';
      }

      joinButton.addEventListener('click', async () => {
        if (alreadyInRoom) {
          redirectTo(`session.html?room_id=${session.id}`);
        } else {
          try {
            const joinResponse = await authFetch('/rooms/join', {
              method: 'POST',
              body: JSON.stringify({ code: session.code }),
            });
            if (joinResponse.ok) {
              const joinData = await joinResponse.json();
              redirectTo(`session.html?room_id=${joinData.room_id}`);
            } else {
              const errorData = await joinResponse.json()
              throw new Error(errorData.message);
            }
          } catch (joinError) {
            console.error('Error joining room:', joinError);
            // Display an error message to the user.
          }
        }
      });

      sessionElement.appendChild(joinButton);
      mySessionsPanel.appendChild(sessionElement);
    }
  } catch (error) {
    console.error('Error fetching my sessions:', error);
    mySessionsPanel.innerHTML = `<p>Error: ${error.message}</p>`;
  }
});
});

// --- Utility for JWT ---
  function parseJwt(token) {
      var base64Url = token.split('.')[1];
      var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));

      return JSON.parse(jsonPayload);
  }