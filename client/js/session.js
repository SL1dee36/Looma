// --- session.js (Frontend - Улучшенная синхронизация) ---
let player;
let roomId;
let isOwner = false;
let roomOwnerId = null;
let lastContentUpdate = null; // Keep track of last received content update
let lastSentTime = 0; // Timestamp of the last time update sent
const SYNC_INTERVAL = 500;  // Minimum interval between time updates (ms)

document.addEventListener('DOMContentLoaded', () => {
    const userIcon = document.getElementById('user-icon');
    const dropdownContent = document.getElementById('dropdown-content');
    const logoutLink = document.getElementById('logout-link');

    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('room_id');
    console.log("Room ID:", roomId); // Debug: Check if roomId is correct

    const sendMessageBtn = document.getElementById('send-message-btn');
    const messageInput = document.getElementById('message-input');
    const chatMessages = document.getElementById('chat-messages');

    const updateContentBtn = document.getElementById('update-content-btn'); // Keep for *initial* video set
    const videoUrlInput = document.getElementById('video-url'); // Keep for initial URL
    // const isPlayingCheckbox = document.getElementById('is-playing'); // REMOVE
    // const playbackPositionInput = document.getElementById('playback-position'); // REMOVE
    const deleteRoomBtn = document.getElementById('delete-room-btn');
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    const roomCodeSpan = document.getElementById('room-code');
    const roomOwnerSpan = document.getElementById('room-owner');
    const updateError = document.getElementById('update-content-error-message');
    const joinFromListError = document.getElementById('join-from-list-error-message'); // Error if user already in room


    const activeSessionsLink = document.getElementById('active-sessions-link');
    const activeSessionsPanel = document.querySelector('.active-sessions-panel');
    const mySessionsLink = document.getElementById('my-sessions-link');
    const mySessionsPanel = document.querySelector('.my-sessions-panel');


    if (!isLoggedIn() || !roomId) {
        redirectTo('auth.html'); // Redirect if not logged in or no room ID
        return;
    }
    //Setup User Icon
    const username = getUsername();
    if (username) {
        userIcon.textContent = username.charAt(0).toUpperCase();
    }
    //Setup Dropdown menu
    userIcon.addEventListener('click', () => {
        dropdownContent.classList.toggle('show');
    });

    logoutLink.addEventListener('click', (e) => {
        e.preventDefault();
        clearAccessToken();
        clearUsername();
        redirectTo('auth.html');
    });

    // Close the dropdown if the user clicks outside of it
    // --- Modified Dropdown Click Handler ---
    window.addEventListener('click', (event) => {
        if (!event.target.matches('.user-icon')) {
            // Check if the click target is *inside* the dropdown
            let targetElement = event.target;
            while (targetElement) {
                if (targetElement.classList && targetElement.classList.contains('dropdown-content')) {
                    return; // Click is inside dropdown, do nothing
                }
                targetElement = targetElement.parentNode;
            }

            // If we reach here, the click was *outside* the dropdown
            if (dropdownContent.classList.contains('show')) {
                dropdownContent.classList.remove('show');
            }
        }
    });
    // --- End Modified Dropdown Click Handler ---


    // --- Room and Content Initialization ---

    async function initializeRoom() {
        try {
            const roomDataResponse = await authFetch(`https://g0tqrn67-5000.euw.devtunnels.ms/rooms/${roomId}`);
            const roomData = await roomDataResponse.json();

            roomOwnerId = roomData.owner_id;
            isOwner = roomOwnerId === parseInt(parseJwt(getAccessToken()).user_id);
            roomCodeSpan.textContent = roomData.code;
            // Correctly get owner's username, handle potential null
            roomOwnerSpan.textContent = roomData.users.find(user => user.id === roomOwnerId)?.username || "Unknown";

            // Show/hide delete button based on ownership, and remove other controls
            if (isOwner) {
                deleteRoomBtn.style.display = 'block';
            }
            if (!isOwner) {
                document.querySelector(".session-settings h2").style.display = "none"; // Hide header
                document.querySelector(".owner-settiongs").style.display = "none";
            }

        } catch (error) {
            console.error("Failed to fetch room info:", error);
            redirectTo('index.html'); // Go back to room selection
            return; // <--- IMPORTANT: Stop execution here
        }

        try {
            const contentDataResponse = await authFetch(`https://g0tqrn67-5000.euw.devtunnels.ms/rooms/${roomId}/content`);
            // Check for a successful response before parsing JSON
            if (!contentDataResponse.ok) {
                throw new Error(`Failed to fetch content: ${contentDataResponse.status}`);
            }
            const contentData = await contentDataResponse.json();
            // Initial synchronization: Load video and state
            if (contentData.video_url) {
                loadVideo(contentData.video_url, contentData.playback_position, contentData.is_playing);
            }
            else {
                if (isOwner) {
                    //Show message to set initial content
                    updateError.textContent = "Please, provide initial content.";
                }
            }
        } catch (error) {
            console.error("Failed to fetch content info:", error);
            // Do NOT redirect here.  Content might not be set yet.
        }
    }
    initializeRoom();
    fetchAndDisplayMessages();


    // --- YouTube Player Functions ---
    function loadVideo(videoUrl, position, shouldPlay) {
        const videoId = extractVideoId(videoUrl);
        if (!videoId) {
            console.error('Invalid YouTube URL');
            return;
        }
    
        if (player && player.getVideoData && player.getVideoData().video_id === videoId) {
            updatePlayerState(position, shouldPlay); //Just update state.
        }
        else {
            // Load the player if not loaded or different video
            if (player) {
                player.destroy(); // Destroy old player if it exists
            }
            player = new YT.Player('player', {
                videoId: videoId,
                playerVars: {
                    'playsinline': 1,
                    'modestbranding': 1,
                    'autoplay': 1,
                    'color': 'white',
                },
                events: {
                    'onReady': (event) => {
                        // Initial setup: Seek and play/pause
                        updatePlayerState(position, shouldPlay);
                    },
                    'onStateChange': onPlayerStateChange
                }
            });
        }
    }

    function updatePlayerState(position, shouldPlay) {
        if (shouldPlay) {
            if (player.getPlayerState() !== YT.PlayerState.PLAYING) {
                player.playVideo();
            }
        }
        else {
            if (player.getPlayerState() !== YT.PlayerState.PAUSED) {
                player.pauseVideo();
            }
        }

        if (Math.abs(player.getCurrentTime() - position) > 1) //avoid constant seeking
        {
            player.seekTo(position, true);
        }
    }


    // IMPORTANT: Only send updates if the *owner* changes the state, and include buffering
    function onPlayerStateChange(event) {
        if (isOwner) {
            const currentTime = player.getCurrentTime();
            const now = Date.now();

            // Always send updates for play/pause/buffer/end, but limit time updates
            if (event.data === YT.PlayerState.PLAYING ||
                event.data === YT.PlayerState.PAUSED ||
                event.data === YT.PlayerState.BUFFERING ||
                event.data === YT.PlayerState.ENDED ||
                (now - lastSentTime > SYNC_INTERVAL)) {

                updateContent();
                lastSentTime = now;
            }
        }
    }

    function extractVideoId(url) {
        const urlParams = new URLSearchParams(new URL(url).search);
        return urlParams.get('v');
    }
    // --- Message Handling ---
    // --- session.js --- (внутри sendMessageBtn.addEventListener)
    sendMessageBtn.addEventListener('click', async () => {
        const messageText = messageInput.value.trim();
        if (messageText) {
            try {
                const dataToSend = { text: messageText }; // Создаем отдельный объект
                console.log("Sending data:", dataToSend);    // ДОБАВЛЕНО: Логируем данные

                await authFetch(`https://g0tqrn67-5000.euw.devtunnels.ms/rooms/${roomId}/message`, {
                    method: 'POST',
                    body: JSON.stringify(dataToSend), // Используем dataToSend
                });
                messageInput.value = '';
                fetchAndDisplayMessages();
            } catch (error) {
                console.error('Error sending message:', error);
            }
        }
    });

    async function fetchAndDisplayMessages() {
        try {
            const response = await authFetch(`https://g0tqrn67-5000.euw.devtunnels.ms/rooms/${roomId}/messages`);
            const data = await response.json();
            displayMessages(data.messages);
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    }

    function displayMessages(messages) {
        chatMessages.innerHTML = ''; // Clear previous messages
        messages.forEach(msg => {
            const messageElement = document.createElement('div');
            messageElement.textContent = `${msg.sender}: ${msg.text} (${new Date(msg.timestamp).toLocaleString()})`;
            chatMessages.appendChild(messageElement);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight; //scroll to bottom
    }

    // --- Delete Room (Owner) ---
    deleteRoomBtn.addEventListener('click', async () => {
        if (isOwner) {
            if (confirm('Are you sure you want to delete this room?')) {
                try {
                    await authFetch(`https://g0tqrn67-5000.euw.devtunnels.ms/rooms/${roomId}`, { method: 'DELETE' });
                    redirectTo('index.html');
                } catch (error) {
                    console.error('Error deleting room:', error);
                }
            }
        }
    });

    // --- Leave Room ---
    leaveRoomBtn.addEventListener('click', async () => {
        try {
            await authFetch(`https://g0tqrn67-5000.euw.devtunnels.ms/rooms/${roomId}/leave`, { method: 'POST' });
            redirectTo('index.html');
        } catch (error) {
            console.error("Failed to leave room:", error);
        }
    })

    // --- Content Update (Owner) - ONLY for initial video set ---
    updateContentBtn.addEventListener('click', () => {
        if (isOwner) {
            updateContent(true); //  initial video set
        }
    });


    // --- Modified updateContent function ---
    async function updateContent(isInitialSet = false) {
        updateError.textContent = ""; // Clear previous errors
        let video_url = null;

        // Only get URL from input if it's the initial set
        if (isInitialSet) {
            video_url = videoUrlInput.value;
             if (!video_url) {
                updateError.textContent = 'Please provide a video URL.';
                return;
            }
        }
        else {
            video_url = player.getVideoData().video_id ? `https://www.youtube.com/watch?v=${player.getVideoData().video_id}` : null;
        }

        const is_playing = player.getPlayerState() === YT.PlayerState.PLAYING;
        const playback_position = player.getCurrentTime();

        if (!video_url)
        {
           if (isInitialSet)
           {
              updateError.textContent = 'Please provide a video URL.';
              return;
           }
           //If not initial and no url, it means player is not set
           //so do nothing, because content is not set yet.
           return;

        }


        try {
            const response = await authFetch(`https://g0tqrn67-5000.euw.devtunnels.ms/rooms/${roomId}/content`, {
                method: 'PUT',
                body: JSON.stringify({ video_url, is_playing, playback_position })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update content');
            }
            // No need to load the video here.  The polling will handle it.

        } catch (error) {
            updateError.textContent = error.message;
            console.error("Error updating content", error);
        }
    }

    // --- Polling for Content Updates ---
    async function getContentUpdates() {
        if (!roomId) return;

        try {
            const response = await authFetch(`https://g0tqrn67-5000.euw.devtunnels.ms/rooms/${roomId}/content`);
            const data = await response.json();

            // More precise comparison to avoid unnecessary actions
            if (!lastContentUpdate ||
                data.video_url !== lastContentUpdate.video_url ||
                data.is_playing !== lastContentUpdate.is_playing ||
                Math.abs(data.playback_position - lastContentUpdate.playback_position) > 1) {

                lastContentUpdate = data;

                if (data.video_url) {
                    loadVideo(data.video_url, data.playback_position, data.is_playing);
                }
            }

        } catch (error) {
            console.error('Error getting content updates:', error);
        }
    }

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
    setInterval(getContentUpdates, 2000); // Poll every 2 seconds
    setInterval(fetchAndDisplayMessages, 5000);

    // --- Utility for JWT ---
    function parseJwt(token) {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    }
});