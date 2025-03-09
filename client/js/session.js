// --- session.js (Frontend - Улучшенная синхронизация с кастомными модальными окнами) ---
let player;
let roomId;
let isOwner = false;
let roomOwnerId = null;
let lastContentUpdate = null; // Keep track of last received content update
let lastSentTime = 0; // Timestamp of the last time update sent
const SYNC_INTERVAL = 500;  // Minimum interval between time updates (ms)
let lastMessageTimestamp = 0; // Store the timestamp of the last displayed message
let currentUserId = null;

// --- Modal Functions (Добавляем в начало) ---

function showConfirmationModal(question, onConfirm, onCancel) {
    const modal = document.getElementById('custom-modal');
    const modalText = document.getElementById('modal-text');
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');

    modalText.textContent = question;
    confirmBtn.style.display = 'inline-block'; // Show confirm button
    cancelBtn.style.display = 'inline-block';   // Show cancel button

    confirmBtn.onclick = () => {
        onConfirm();
        modal.style.display = 'none';
    };

    cancelBtn.onclick = () => {
        if (onCancel) {
            onCancel();
        }
        modal.style.display = 'none';
    };

    modal.style.display = 'block';
}

function showInfoModal(message) {
    const modal = document.getElementById('custom-modal');
    const modalText = document.getElementById('modal-text');
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');

    modalText.textContent = message;
    confirmBtn.style.display = 'none';  // Hide confirm button
    cancelBtn.style.display = 'none';   // Hide cancel button

    //  You *could* add a close button here, but we already have the "x"
    modal.style.display = 'block';
}

// Close modal when clicking the "x" button
document.querySelector('.close-modal-btn').addEventListener('click', () => {
  document.getElementById('custom-modal').style.display = 'none';
});

// Close modal when clicking outside the modal content
window.addEventListener('click', (event) => {
  const modal = document.getElementById('custom-modal');
  if (event.target === modal) {
    modal.style.display = 'none';
  }
});


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

    // --- NEW: Clear Chat Button (Owner Only) ---
    const clearChatBtn = document.createElement('button');
    clearChatBtn.textContent = 'Clear Chat';
    clearChatBtn.id = 'clear-chat-btn';
    clearChatBtn.style.display = 'none'; // Hidden by default
    clearChatBtn.addEventListener('click', async () => {
        // --- Use custom modal ---
        showConfirmationModal('Are you sure you want to clear all messages?', async () => {
            try {
                await authFetch(`/rooms/${roomId}/messages/clear`, { method: 'DELETE' });
                chatMessages.innerHTML = '';
                lastMessageTimestamp = 0;
            } catch (error) {
                console.error('Error clearing chat:', error);
            }
        });
    });
    document.querySelector('.session-settings').appendChild(clearChatBtn); // Add to settings


    if (!isLoggedIn() || !roomId) {
        redirectTo('auth.html'); // Redirect if not logged in or no room ID
        return;
    }
    currentUserId = parseInt(parseJwt(getAccessToken()).user_id);
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
            const roomDataResponse = await authFetch(`/rooms/${roomId}`);  // Use authFetch
            const roomData = await roomDataResponse.json();

            roomOwnerId = roomData.owner_id;
            isOwner = roomOwnerId === currentUserId;
            roomCodeSpan.textContent = roomData.code;
            // Correctly get owner's username, handle potential null
            roomOwnerSpan.textContent = roomData.users.find(user => user.id === roomOwnerId)?.username || "Unknown";

            // Show/hide delete button based on ownership, and remove other controls
            if (isOwner) {
                deleteRoomBtn.style.display = 'block';
                clearChatBtn.style.display = 'block'; // Show "Clear Chat" for owner
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
            const contentDataResponse = await authFetch(`/rooms/${roomId}/content`); // Use authFetch
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
    sendMessageBtn.addEventListener('click', async () => {
        const messageText = messageInput.value.trim();
        if (messageText) {
            try {
                const dataToSend = { text: messageText }; // Создаем отдельный объект
                console.log("Sending data:", dataToSend);    // ДОБАВЛЕНО: Логируем данные

                await authFetch(`/rooms/${roomId}/message`, { // Use authFetch
                    method: 'POST',
                    body: JSON.stringify(dataToSend), // Используем dataToSend
                });
                messageInput.value = '';
                fetchAndDisplayMessages(); // Re-fetch *after* sending
            } catch (error) {
                console.error('Error sending message:', error);
            }
        }
    });

     // --- Optimized fetchAndDisplayMessages ---
     async function fetchAndDisplayMessages() {
        try {
            const response = await authFetch(`/rooms/${roomId}/messages`);
            const data = await response.json();

            // Filter messages to only include new ones:
            const newMessages = data.messages.filter(msg =>
                new Date(msg.timestamp).getTime() > lastMessageTimestamp
            );

            displayMessages(newMessages, lastMessageTimestamp === 0); // Pass a flag for initial load

            if (data.messages.length > 0) {
                //Update lastMessageTimestamp even if no *new* messages (for initial load):
                lastMessageTimestamp = new Date(data.messages[data.messages.length - 1].timestamp).getTime();
            }

        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    }
    // --- Optimized displayMessages function ---
    function displayMessages(messages, isInitialLoad) {
        let currentDate = null;

        // Get last date header if it is NOT initial load.
        if (!isInitialLoad) {
            const lastDateHeader = chatMessages.querySelector('.date-header:last-of-type');
            if (lastDateHeader) {
                currentDate = lastDateHeader.textContent;
            }
        }

        messages.forEach(msg => {
            const msgDate = new Date(msg.timestamp).toLocaleDateString();

            if (msgDate !== currentDate) {
                const existingDateHeader = Array.from(chatMessages.querySelectorAll('.date-header'))
                    .find(header => header.textContent === msgDate);

                if (!existingDateHeader) {
                    currentDate = msgDate;
                    const dateHeader = document.createElement('div');
                    dateHeader.textContent = currentDate;
                    dateHeader.classList.add('date-header');
                    chatMessages.appendChild(dateHeader);
                } else {
                    currentDate = msgDate; // STILL update currentDate, even if header exists
                }
            }
            // --- Message Container (same as before) ---
            const messageContainer = document.createElement('div');
            messageContainer.classList.add('message-container');
            messageContainer.dataset.messageId = msg.id; // Store message ID

            // --- Avatar ---
            const avatar = document.createElement('div');
            avatar.classList.add('message-avatar');
            avatar.textContent = msg.sender.charAt(0).toUpperCase();
            messageContainer.appendChild(avatar);

            // --- Message Content (Username, Text, Time) ---
            const messageContent = document.createElement('div');
            messageContent.classList.add('message-content');

            const usernameSpan = document.createElement('span');
            usernameSpan.classList.add('message-username');
            usernameSpan.textContent = msg.sender + ": ";
            messageContent.appendChild(usernameSpan);

            const textSpan = document.createElement('span');
            textSpan.classList.add('message-text');
            textSpan.textContent = msg.text;  // No extra spaces here
            messageContent.appendChild(textSpan);

            const timeSpan = document.createElement('span');
            timeSpan.classList.add('message-time');
            timeSpan.textContent = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            messageContent.appendChild(timeSpan);

            messageContainer.appendChild(messageContent);


            // --- Options Menu (Conditional) ---
            if (msg.sender === getUsername() || isOwner) {
                const controlsDiv = document.createElement('div');
                controlsDiv.classList.add('message-controls');

                // Options Menu Button (Three Dots)
                const optionsBtn = document.createElement('button');
                optionsBtn.innerHTML = '⋮'; // Three vertical dots
                optionsBtn.classList.add('options-menu-btn');
                optionsBtn.addEventListener('click', (event) => {
                    // Prevent event from bubbling up to the message container (important!)
                    event.stopPropagation();
                    toggleOptionsMenu(optionsBtn, msg.id, messageContainer, msg.text);
                });
                controlsDiv.appendChild(optionsBtn);

                // Initially hidden options menu
                const optionsMenu = document.createElement('div');
                optionsMenu.classList.add('options-menu');
                optionsMenu.style.display = 'none'; // Hidden by default
                controlsDiv.appendChild(optionsMenu);

                messageContainer.appendChild(controlsDiv);
            }

            chatMessages.appendChild(messageContainer);
        });

        if (messages.length > 0) {  //scroll only if messages added.
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }


    // --- Toggle Options Menu ---
    function toggleOptionsMenu(button, messageId, messageContainer, currentText) {
        const optionsMenu = button.nextElementSibling; //  Get the *sibling* menu

        // Close any other open menus
        document.querySelectorAll('.options-menu').forEach(menu => {
            if (menu !== optionsMenu) { // Don't close the current menu
                menu.style.display = 'none';
            }
        });

        // Toggle the display of the clicked menu
        if (optionsMenu.style.display === 'none' || optionsMenu.style.display === '') {
            optionsMenu.style.display = 'block';
            optionsMenu.innerHTML = ''; // Clear previous contents

            // Add options (Delete, Edit) *inside* the menu
            if (messageContainer.querySelector('.message-username').textContent.startsWith(getUsername())) {
              const editBtn = document.createElement('button');
              editBtn.textContent = 'Edit';
              editBtn.classList.add('edit-message-btn'); // Keep class for styling
              editBtn.addEventListener('click', () => {
                  optionsMenu.style.display = 'none'; // Hide menu
                  createEditInterface(messageContainer, messageId, currentText);
              });
              optionsMenu.appendChild(editBtn);
            }


            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.classList.add('delete-message-btn');
            deleteBtn.addEventListener('click', () => {
                optionsMenu.style.display = 'none'; // Hide menu
                // --- Use custom modal ---
                showConfirmationModal('Are you sure you want to delete this message?', () => {
                    deleteMessage(messageId, messageContainer);
                });
            });
            optionsMenu.appendChild(deleteBtn);

        } else {
            optionsMenu.style.display = 'none';
        }
    }
    // --- Helper function to create the edit interface ---
    function createEditInterface(messageContainer, messageId, currentText) {
        const messageContent = messageContainer.querySelector('.message-content');
        const textSpan = messageContent.querySelector('.message-text');
        const controlsDiv = messageContainer.querySelector('.message-controls');
        const optionsBtn = controlsDiv.querySelector('.options-menu-btn');
        // 1. Replace text with input
        const editInput = document.createElement('input');
        editInput.type = 'text';
        editInput.value = currentText;
        editInput.classList.add('edit-message-input');
        messageContent.replaceChild(editInput, textSpan); //  Replace the text span

        // 2.  Hide existing controls, and add Save/Cancel
        optionsBtn.style.display = "none";
        // controlsDiv.style.display = 'none';  // Hide existing controls
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.classList.add('save-message-btn');
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.classList.add('cancel-message-btn');

        const editControlsDiv = document.createElement('div'); // Use a separate div
        editControlsDiv.classList.add('edit-controls');
        editControlsDiv.appendChild(saveBtn);
        editControlsDiv.appendChild(cancelBtn);
        messageContainer.appendChild(editControlsDiv);

        // 3. Event Listeners
        saveBtn.addEventListener('click', async () => {
            const newText = editInput.value.trim();
            if (newText) {
                try {
                    const response = await authFetch(`/rooms/${roomId}/messages/${messageId}`, {
                        method: 'PUT',
                        body: JSON.stringify({ text: newText }),
                    });

                    if (response.ok) {
                        // Update UI: replace input with new text span
                        textSpan.textContent = newText;
                        messageContent.replaceChild(textSpan, editInput);
                        editControlsDiv.remove();
                        optionsBtn.style.display = "";
                        // controlsDiv.style.display = ''; // Show original controls again.

                    } else {
                        const errorData = await response.json();
                        console.error('Error editing message:', errorData.message || 'Unknown error');
                        //  Handle error - maybe show a message to the user?
                    }

                } catch (error) {
                    console.error('Error editing message:', error);
                }
            }
        });

        cancelBtn.addEventListener('click', () => {
            // Restore original text, switch back to span, show original controls
            messageContent.replaceChild(textSpan, editInput);
            editControlsDiv.remove(); // Remove save/cancel buttons
            optionsBtn.style.display = "";
            // controlsDiv.style.display = ''; // Show original controls
        });
    }

    // --- Delete Message Function ---
    async function deleteMessage(messageId, messageContainer) {
        // --- Confirmation is now handled in the options menu click handler ---
        try {
            const response = await authFetch(`/rooms/${roomId}/messages/${messageId}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                messageContainer.remove(); // Remove from DOM immediately
                //No need to refetch all.
            } else {
                const errorData = await response.json();
                console.error('Error deleting message:', errorData.message || 'Unknown error');
            }
        } catch (error) {
            console.error('Error deleting message:', error);
        }

    }
    // --- Delete Room (Owner) ---
    deleteRoomBtn.addEventListener('click', async () => {
        // --- Use custom modal ---
        showConfirmationModal('Are you sure you want to delete this room?', async () => {
            if (isOwner) {
                try {
                    await authFetch(`/rooms/${roomId}`, { method: 'DELETE' });
                    redirectTo('index.html');
                } catch (error) {
                    console.error('Error deleting room:', error);
                }
            }
        });
    });

    // --- Leave Room ---
    leaveRoomBtn.addEventListener('click', async () => {
        try {
            await authFetch(`/rooms/${roomId}/leave`, { method: 'POST' }); // Use authFetch
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
        let is_playing = false;
        let playback_position = 0;
        //CRITICAL FIX: check if player is initialized, and if not, dont get the time and state.
        if(player)
        {
            is_playing = player.getPlayerState() === YT.PlayerState.PLAYING;
            playback_position = player.getCurrentTime();
        }


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
            const response = await authFetch(`/rooms/${roomId}/content`, { // Use authFetch
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
            const response = await authFetch(`/rooms/${roomId}/content`); // Use authFetch
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
            const response = await authFetch(`/rooms/${roomId}`); // Use authFetch
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
      const response = await authFetch('/rooms/active'); // Use authFetch
      if (!response.ok) {
        throw new Error(`Failed to fetch active rooms: ${response.status}`);
      }
      const sessions = await response.json();

      if (sessions.length === 0) {
        activeSessionsPanel.innerHTML = '<p>No active sessions found.</p>';
        return;
      }

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
        const alreadyInRoom = await isUserInRoom(session.id, currentUserId);

        if (alreadyInRoom) {
          joinButton.textContent = 'Enter'; // Change button text for clarity
        }

        joinButton.addEventListener('click', async () => {
          if (alreadyInRoom) {
            redirectTo(`session.html?room_id=${session.id}`);
          } else {
            try {
              const joinResponse = await authFetch('/rooms/join', { // Use authFetch
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
              showInfoModal(joinError.message);
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
      const response = await authFetch('/rooms/my'); // Use authFetch
      if (!response.ok) {
        throw new Error(`Failed to fetch my rooms: ${response.status}`);
      }
      const sessions = await response.json();

      if (sessions.length === 0) {
        mySessionsPanel.innerHTML = '<p>You have not created any sessions.</p>';
        return;
      }


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
        const alreadyInRoom = await isUserInRoom(session.id, currentUserId);
        if(alreadyInRoom){
            joinButton.textContent = 'Enter';
        }

        joinButton.addEventListener('click', async () => {
          if (alreadyInRoom) {
            redirectTo(`session.html?room_id=${session.id}`);
          } else {
            try {
              const joinResponse = await authFetch('/rooms/join', { // Use authFetch
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
              showInfoModal(joinError.message);
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
  // --- Click-Outside Handler (Close Options Menu) ---
  window.addEventListener('click', (event) => {
    if (!event.target.closest('.message-controls')) {
      // Close *all* open menus
      document.querySelectorAll('.options-menu').forEach(menu => {
        menu.style.display = 'none';
      });
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