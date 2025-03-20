// --- session.js ---

let player;
let backgroundPlayer;
let roomId;
let isOwner = false;
let roomOwnerId = null;
let lastContentUpdate = null;
let lastSentTime = 0;
const SYNC_INTERVAL = 500;
let lastMessageTimestamp = 0;
let currentUserId = null;
let currentVideoSource = 'youtube'; // Изначально YouTube
let iframe = null; // Глобальная переменная для iframe

// --- Modal Functions ---

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

    modal.style.display = 'block';
}

// Close modal when clicking the "x" button  (СТАРОЕ)
document.querySelector('.close-modal-btn').addEventListener('click', () => {
  document.getElementById('custom-modal').style.display = 'none';
});

// Close search modal (НОВОЕ, для #search-modal)
document.querySelector('.close-search-modal-btn').addEventListener('click', () => {
    document.getElementById('search-modal').style.display = 'none';
});

// Close modal when clicking outside the modal content (СТАРОЕ + ИЗМЕНЕНИЕ)
window.addEventListener('click', (event) => {
  const modal = document.getElementById('custom-modal');
  const searchModal = document.getElementById('search-modal'); // НОВОЕ

  if (event.target === modal) {
    modal.style.display = 'none';
  }
  if (event.target === searchModal) { // НОВОЕ
        searchModal.style.display = 'none';
  }
});


document.addEventListener('DOMContentLoaded', () => {
    // --- Элементы DOM ---
    const userIcon = document.getElementById('user-icon');
    const dropdownContent = document.getElementById('dropdown-content');
    const logoutLink = document.getElementById('logout-link');

    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('room_id');
    console.log("Room ID:", roomId);

    const sendMessageBtn = document.getElementById('send-message-btn');
    const messageInput = document.getElementById('message-input');
    const chatMessages = document.getElementById('chat-messages');

    const updateContentBtn = document.getElementById('update-content-btn');
    const videoUrlInput = document.getElementById('video-url'); // For YouTube
    const deleteRoomBtn = document.getElementById('delete-room-btn');
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    const roomCodeSpan = document.getElementById('room-code');
    const roomOwnerSpan = document.getElementById('room-owner');
    const updateError = document.getElementById('update-content-error-message');

    const activeSessionsLink = document.getElementById('active-sessions-link');
    const activeSessionsPanel = document.querySelector('.active-sessions-panel');
    const mySessionsLink = document.getElementById('my-sessions-link');
    const mySessionsPanel = document.querySelector('.my-sessions-panel');

    const searchInput = document.getElementById('movie-title'); // For HDrezka
    const searchButton = document.getElementById('search-button'); // For HDrezka

    const clearChatBtn = document.createElement('button');
    clearChatBtn.textContent = 'Clear Chat';
    clearChatBtn.id = 'clear-chat-btn';
    clearChatBtn.style.display = 'none'; // Hidden by default
    clearChatBtn.addEventListener('click', async () => {
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
    document.querySelector('.session-settings').appendChild(clearChatBtn);

      // --- Online Users List ---
    const onlineUsersList = document.createElement('ul');
    onlineUsersList.id = 'online-users-list';
    const onlineUsersContainer = document.createElement('div');
    onlineUsersContainer.classList.add('online-users-container'); // Add class
    const onlineUsersTitle = document.createElement('h3');
    onlineUsersTitle.textContent = 'Online Users';
    onlineUsersContainer.appendChild(onlineUsersTitle);
    onlineUsersContainer.appendChild(onlineUsersList);

      // Insert *before* the room info, but *inside* session-settings
    document.querySelector('.session-settings').insertBefore(onlineUsersContainer, document.getElementById('room-info'));


    // --- Проверка авторизации и получение ID пользователя ---
    if (!isLoggedIn() || !roomId) {
        redirectTo('auth.html');
        return;
    }
    currentUserId = parseInt(parseJwt(getAccessToken()).user_id);

    // --- Установка имени пользователя в иконке ---
    const username = getUsername();
    if (username) {
        userIcon.textContent = username.charAt(0).toUpperCase();
    }

    // --- Обработчики для выпадающего меню ---
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

    // --- Переключатель источника видео ---
    const videoSourceSwitcher = document.querySelector('.video-source-switcher');
    const playerContainer = document.getElementById('player-container');
    const hdrezkaSearch = document.getElementById('hdrezka-search');
    const youtubeSettings = document.getElementById('youtube-settings');
    const backgroundPlayerContainer = document.getElementById('background-player-container');

    videoSourceSwitcher.addEventListener('change', (event) => {
        currentVideoSource = event.target.value;
        if (currentVideoSource === 'youtube') {
            playerContainer.style.display = 'block';
            hdrezkaSearch.style.display = 'none';
             if (isOwner) {
                youtubeSettings.style.display = 'block';
            }
            if(backgroundPlayer){
              backgroundPlayerContainer.style.display = "block";
            }
            if (player) {
                player.playVideo(); // Возобновляем YouTube, если он был
            }
            destroyHdrezaPlayer(); //Удаляем плеер с фильмом.
        } else if (currentVideoSource === 'hdrezka') {
            playerContainer.style.display = 'none';
            hdrezkaSearch.style.display = 'block';
            youtubeSettings.style.display = 'none';

            if (backgroundPlayer) {
                backgroundPlayer.pauseVideo();
                backgroundPlayerContainer.style.display = "none"; // скрываем
            }
            if (player) {
                player.stopVideo(); // Останавилваем плеер
            }
        }
        // Сбрасываем URL, чтобы при смене источника не было конфликтов
        updateContentFromServer(null, 0, false);
    });

    // --- Поиск HDrezka (обработчик) ---
    searchButton.addEventListener('click', async () => {
        const movieTitle = searchInput.value;
        if (movieTitle) {
            try {
                const searchResponse = await authFetch('/rooms/search', {
                    method: 'POST',
                    body: JSON.stringify({ title: movieTitle }),
                });
                if (!searchResponse.ok) {
                    throw new Error('Search failed');
                }
                const searchResults = await searchResponse.json();
                showSearchModal(searchResults); // Показываем результаты в модальном окне
            } catch (error) {
                console.error('Error searching for movie:', error);
            }
        }
    });


    // --- ИЗМЕНЕННАЯ showSearchModal ---
    function showSearchModal(results) {
        const modal = document.getElementById('search-modal'); //  Используем НОВОЕ модальное окно
        const resultsContainer = document.getElementById('search-results'); //  Этот div теперь внутри НОВОГО модального окна
        resultsContainer.innerHTML = ''; // Очищаем

        if (!results || results.length === 0) {
            resultsContainer.textContent = 'Фильмы не найдены.';
            modal.style.display = 'block'; // Показываем модальное окно (даже если пустое)
            return; //  Выходим, если нет результатов
        }

        const ul = document.createElement('ul');
        results.forEach(movie => {
            const li = document.createElement('li');
            li.style.cursor = 'pointer';
            li.textContent = `${movie.title} (${movie.yearCountry})`;

            const img = document.createElement('img');
            img.src = movie.posterUrl;
            img.alt = movie.title;
            img.style.width = '100px';
            img.style.height = 'auto';
            img.style.marginRight = '10px';
            li.prepend(img);
            ul.appendChild(li);

            // ---  Добавляем обработчик для ВЫБОРА фильма ---
            li.addEventListener('click', async () => {
                try {
                    const iframeResponse = await authFetch('/rooms/iframe', {
                        method: 'POST',
                        body: JSON.stringify({ movie_url: movie.movieUrl }),
                    });
                    if (!iframeResponse.ok) {
                        throw new Error('Failed to get iframe');
                    }
                    const iframeData = await iframeResponse.json();

                     // Вызываем функцию для обновления RoomContent и загрузки видео
                    await updateContentFromServer(iframeData.iframe_src); // Убедись что здесь!
                    modal.style.display = 'none'; //Закрываем окно.


                } catch (error) {
                    console.error('Error getting iframe:', error);
                }
            });
        });
        resultsContainer.appendChild(ul);
        modal.style.display = 'block'; // Показываем модальное окно
    }




    async function updateContentFromServer(video_url, playback_position = 0, is_playing = false) {
        updateError.textContent = "";

        try {
            const response = await authFetch(`/rooms/${roomId}/content`, {
                method: 'PUT',
                body: JSON.stringify({ video_url, is_playing, playback_position })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update content');
            }

        } catch (error) {
            updateError.textContent = error.message;
            console.error("Error updating content", error);
        }
    }


    async function initializeRoom() {
        // --- Получение данных о комнате ---
          try {
            const roomDataResponse = await authFetch(`/rooms/${roomId}`);
            const roomData = await roomDataResponse.json();

            roomOwnerId = roomData.owner_id;
            isOwner = roomOwnerId === currentUserId;
            roomCodeSpan.textContent = roomData.code;
            roomOwnerSpan.textContent = roomData.users.find(user => user.id === roomOwnerId)?.username || "Unknown";

            if (isOwner) {
                deleteRoomBtn.style.display = 'block';
                clearChatBtn.style.display = 'block';
            }
            else{
              document.querySelector(".session-settings h2").style.display = "none";
              document.querySelector(".owner-settiongs").style.display = "none";
            }

        } catch (error) {
            console.error("Failed to fetch room info:", error);
            redirectTo('index.html');
            return;
        }

        // --- Получение данных о контенте ---
        try {
            const contentDataResponse = await authFetch(`/rooms/${roomId}/content`);
            if (!contentDataResponse.ok) {
                throw new Error(`Failed to fetch content: ${contentDataResponse.status}`);
            }
            const contentData = await contentDataResponse.json();

            // ---  Определяем источник видео при инициализации ---
            if (contentData.video_url) {
              if (contentData.video_url.includes('youtube.com')) {
                currentVideoSource = 'youtube';
                document.querySelector('[name="video-source"][value="youtube"]').checked = true;
                playerContainer.style.display = 'block';
                hdrezkaSearch.style.display = 'none';
                loadVideo(contentData.video_url, contentData.playback_position, contentData.is_playing);
            }
            else
            {
              currentVideoSource = 'hdrezka';
              document.querySelector('[name="video-source"][value="hdrezka"]').checked = true;
              playerContainer.style.display = 'none';
              hdrezkaSearch.style.display = 'block';
               if (isOwner) {
                 youtubeSettings.style.display = 'none';
                }

              if(backgroundPlayer) backgroundPlayerContainer.style.display = "none";

              createHdrezaPlayer(contentData.video_url)
            }

            }
            else {
                if (isOwner) {
                    updateError.textContent = "Please, provide initial content.";
                }
            }
        } catch (error) {
            console.error("Failed to fetch content info:", error);
        }
    }

    initializeRoom();
    fetchAndDisplayMessages();
    fetchAndDisplayOnlineUsers();


    // --- Функция loadVideo (для YouTube) ---
  function loadVideo(videoUrl, position, shouldPlay) {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
        console.error('Invalid YouTube URL');
        return;
    }
    if (player && player.getVideoData && player.getVideoData().video_id === videoId) {
        updatePlayerState(position, shouldPlay, player); // Уже существует, обновляем
    } else {
        if (player) {
            player.destroy(); // Удаляем старый, если есть
        }
        player = new YT.Player('player', {
            videoId: videoId,
            playerVars: {
                'playsinline': 1,
                'modestbranding': 1,
                'autoplay': shouldPlay ? 1 : 0,
                'color':"white",
            },
            events: {
                'onReady': (event) => {
                    updatePlayerState(position, shouldPlay, event.target); // Обновляем состояние
                },
                'onStateChange': onPlayerStateChange
            }
        });
    }

    if (backgroundPlayer && backgroundPlayer.getVideoData && backgroundPlayer.getVideoData().video_id === videoId) {
        updatePlayerState(position, shouldPlay, backgroundPlayer); // Уже существует
    } else {
        if (backgroundPlayer) {
            backgroundPlayer.destroy();
        }

        backgroundPlayer = new YT.Player('background-player', {
            videoId: videoId,
            playerVars: {
                'playsinline': 1,
                'modestbranding': 1,
                'autoplay': shouldPlay ? 1 : 0,
                'controls': 0,
                'disablekb': 1,
                'fs': 0,
                'loop': 1,
                'playlist': videoId, // loop
            },
            events: {
                'onReady': (event) => {
                    event.target.mute();
                    updatePlayerState(position, shouldPlay, event.target);
                },
                'onStateChange': onPlayerStateChangeBackground
            }
        });
    }
}


    function updatePlayerState(position, shouldPlay, playerInstance) {
        if(!playerInstance) return;

        if (shouldPlay) {
            if (playerInstance.getPlayerState() !== YT.PlayerState.PLAYING) {
                playerInstance.playVideo();
            }
        }
        else {
            if (playerInstance.getPlayerState() !== YT.PlayerState.PAUSED) {
                playerInstance.pauseVideo();
            }
        }

        if (Math.abs(playerInstance.getCurrentTime() - position) > 1) {
            playerInstance.seekTo(position, true);
        }
    }

    // --- Обработчик изменений состояния ОСНОВНОГО плеера (без изменений) ---
    function onPlayerStateChange(event) {
         if(!isOwner) return;

        const currentTime = player.getCurrentTime();
        const now = Date.now();

        if (event.data === YT.PlayerState.PLAYING ||
            event.data === YT.PlayerState.PAUSED ||
            event.data === YT.PlayerState.BUFFERING ||
            event.data === YT.PlayerState.ENDED ||
            (now - lastSentTime > SYNC_INTERVAL))
            {
               if (currentVideoSource === "youtube")
               {
                  updateContent(false);
               }
                lastSentTime = now;
            }
    }

    function onPlayerStateChangeBackground(event) {
      //Пока оставим пустым.
    }


    function extractVideoId(url) {
        const urlParams = new URLSearchParams(new URL(url).search);
        return urlParams.get('v');
    }

  // --- Функции для iframe (HDrezka) ---

    function createHdrezaPlayer(iframeSrc) {
        destroyHdrezaPlayer(); // Удаляем, если уже есть

        iframe = document.createElement('iframe');
        iframe.src = iframeSrc;
        iframe.width = '100%';
        iframe.height = '100%';
        iframe.allowFullscreen = true;
        iframe.style.border = 'none';
        iframe.style.borderRadius = "6px";
        // Добавляем стили (убедись, что они здесь)
        iframe.style.zIndex = '99';
        iframe.style.position = 'relative';

        // Важно:  Добавляем iframe *внутрь* playerContainer!
        document.getElementById('player-container').appendChild(iframe);
        playerContainer.style.display = 'block'; // Убеждаемся что контейнер виден

    }


    function destroyHdrezaPlayer(){
    if(iframe){
        iframe.remove();
        iframe = null;
    }
    }


    // --- Функции для сообщений ---

    sendMessageBtn.addEventListener('click', async () => {
        const messageText = messageInput.value.trim();
        if (messageText) {
            try {
                const dataToSend = { text: messageText };
                console.log("Sending data:", dataToSend);

                await authFetch(`/rooms/${roomId}/message`, {
                    method: 'POST',
                    body: JSON.stringify(dataToSend),
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
            const response = await authFetch(`/rooms/${roomId}/messages`);
            const data = await response.json();

            const newMessages = data.messages.filter(msg =>
                new Date(msg.timestamp).getTime() > lastMessageTimestamp
            );

            displayMessages(newMessages, lastMessageTimestamp === 0);

            if (data.messages.length > 0) {
                lastMessageTimestamp = new Date(data.messages[data.messages.length - 1].timestamp).getTime();
            }

        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    }
     function displayMessages(messages, isInitialLoad) {
        let currentDate = null;

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
                    currentDate = msgDate;
                }
            }
            const messageContainer = document.createElement('div');
            messageContainer.classList.add('message-container');
            messageContainer.dataset.messageId = msg.id;

            const avatar = document.createElement('div');
            avatar.classList.add('message-avatar');
            avatar.textContent = msg.sender.charAt(0).toUpperCase();
            messageContainer.appendChild(avatar);

            const messageContent = document.createElement('div');
            messageContent.classList.add('message-content');

            const usernameSpan = document.createElement('span');
            usernameSpan.classList.add('message-username');
            usernameSpan.textContent = msg.sender + ": ";
            messageContent.appendChild(usernameSpan);

            const textSpan = document.createElement('span');
            textSpan.classList.add('message-text');
            textSpan.textContent = msg.text;
            messageContent.appendChild(textSpan);

            const timeSpan = document.createElement('span');
            timeSpan.classList.add('message-time');
            timeSpan.textContent = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            messageContent.appendChild(timeSpan);

            messageContainer.appendChild(messageContent);


            if (msg.sender === getUsername() || isOwner) {
                const controlsDiv = document.createElement('div');
                controlsDiv.classList.add('message-controls');

                const optionsBtn = document.createElement('button');
                optionsBtn.innerHTML = '⋮';
                optionsBtn.classList.add('options-menu-btn');
                optionsBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    toggleOptionsMenu(optionsBtn, msg.id, messageContainer, msg.text);
                });
                controlsDiv.appendChild(optionsBtn);

                const optionsMenu = document.createElement('div');
                optionsMenu.classList.add('options-menu');
                optionsMenu.style.display = 'none';
                controlsDiv.appendChild(optionsMenu);

                messageContainer.appendChild(controlsDiv);
            }

            chatMessages.appendChild(messageContainer);
        });

        if (messages.length > 0) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    function toggleOptionsMenu(button, messageId, messageContainer, currentText) {
        const optionsMenu = button.nextElementSibling;

        document.querySelectorAll('.options-menu').forEach(menu => {
            if (menu !== optionsMenu) {
                menu.style.display = 'none';
            }
        });

        if (optionsMenu.style.display === 'none' || optionsMenu.style.display === '') {
            optionsMenu.style.display = 'block';
            optionsMenu.innerHTML = '';

            if (messageContainer.querySelector('.message-username').textContent.startsWith(getUsername())) {
              const editBtn = document.createElement('button');
              editBtn.textContent = 'Edit';
              editBtn.classList.add('edit-message-btn');
              editBtn.addEventListener('click', () => {
                  optionsMenu.style.display = 'none';
                  createEditInterface(messageContainer, messageId, currentText);
              });
              optionsMenu.appendChild(editBtn);
            }


            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.classList.add('delete-message-btn');
            deleteBtn.addEventListener('click', () => {
                optionsMenu.style.display = 'none';
                showConfirmationModal('Are you sure you want to delete this message?', () => {
                    deleteMessage(messageId, messageContainer);
                });
            });
            optionsMenu.appendChild(deleteBtn);

        } else {
            optionsMenu.style.display = 'none';
        }
    }

     function createEditInterface(messageContainer, messageId, currentText) {
        const messageContent = messageContainer.querySelector('.message-content');
        const textSpan = messageContent.querySelector('.message-text');
        const controlsDiv = messageContainer.querySelector('.message-controls');
        const optionsBtn = controlsDiv.querySelector('.options-menu-btn');

        const editInput = document.createElement('input');
        editInput.type = 'text';
        editInput.value = currentText;
        editInput.classList.add('edit-message-input');
        messageContent.replaceChild(editInput, textSpan);

        optionsBtn.style.display = "none";

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.classList.add('save-message-btn');
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.classList.add('cancel-message-btn');

        const editControlsDiv = document.createElement('div');
        editControlsDiv.classList.add('edit-controls');
        editControlsDiv.appendChild(saveBtn);
        editControlsDiv.appendChild(cancelBtn);
        messageContainer.appendChild(editControlsDiv);

        saveBtn.addEventListener('click', async () => {
            const newText = editInput.value.trim();
            if (newText) {
                try {
                    const response = await authFetch(`/rooms/${roomId}/messages/${messageId}`, {
                        method: 'PUT',
                        body: JSON.stringify({ text: newText }),
                    });

                    if (response.ok) {
                        textSpan.textContent = newText;
                        messageContent.replaceChild(textSpan, editInput);
                        editControlsDiv.remove();
                        optionsBtn.style.display = "";

                    } else {
                        const errorData = await response.json();
                        console.error('Error editing message:', errorData.message || 'Unknown error');
                    }

                } catch (error) {
                    console.error('Error editing message:', error);
                }
            }
        });

        cancelBtn.addEventListener('click', () => {
            messageContent.replaceChild(textSpan, editInput);
            editControlsDiv.remove();
            optionsBtn.style.display = "";
        });
    }

    async function deleteMessage(messageId, messageContainer) {

        try {
            const response = await authFetch(`/rooms/${roomId}/messages/${messageId}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                messageContainer.remove();
            } else {
                const errorData = await response.json();
                console.error('Error deleting message:', errorData.message || 'Unknown error');
            }
        } catch (error) {
            console.error('Error deleting message:', error);
        }

    }
    // --- Кнопки управления комнатой ---

    deleteRoomBtn.addEventListener('click', async () => {
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


    leaveRoomBtn.addEventListener('click', async () => {
        try {
            await authFetch(`/rooms/${roomId}/leave`, { method: 'POST' });
            redirectTo('index.html');
        } catch (error) {
            console.error("Failed to leave room:", error);
        }
    })

    // --- Обновление контента (YouTube) ---
    updateContentBtn.addEventListener('click', () => {
        if (isOwner && currentVideoSource === 'youtube') {
            updateContent(true);
        }
    });

    async function updateContent(isInitialSet = false) {
        updateError.textContent = "";
        let video_url = null;

        if (isInitialSet) {
            video_url = videoUrlInput.value;
             if (!video_url) {
                updateError.textContent = 'Please provide a video URL.';
                return;
            }
        }
        else {
           video_url = player && player.getVideoData().video_id ? `https://www.youtube.com/watch?v=${player.getVideoData().video_id}` : null;
        }

        let is_playing = false;
        let playback_position = 0;

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

           return;

        }


        try {
            const response = await authFetch(`/rooms/${roomId}/content`, {
                method: 'PUT',
                body: JSON.stringify({ video_url, is_playing, playback_position })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update content');
            }


        } catch (error) {
            updateError.textContent = error.message;
            console.error("Error updating content", error);
        }
    }

    // --- Получение обновлений контента ---
    async function getContentUpdates() {
        if (!roomId) return;

        try {
            const response = await authFetch(`/rooms/${roomId}/content`);
            const data = await response.json();
            let shouldLoad = false;

            if (!lastContentUpdate) {
                shouldLoad = true;
            } else if (data.video_url !== lastContentUpdate.video_url) {
                shouldLoad = true;
            } else if (currentVideoSource === 'youtube') {
                if (data.is_playing !== lastContentUpdate.is_playing ||
                    Math.abs(data.playback_position - lastContentUpdate.playback_position) > 1) {
                    shouldLoad = true;
                }
            }

            if (shouldLoad) {
                lastContentUpdate = data;
                if (data.video_url) {
                    if (data.video_url.includes('youtube.com')) {
                        if (currentVideoSource !== 'youtube') {
                            currentVideoSource = 'youtube';
                            document.querySelector('[name="video-source"][value="youtube"]').checked = true;
                            playerContainer.style.display = 'block';
                            hdrezkaSearch.style.display = 'none';
                            if(backgroundPlayer){
                              backgroundPlayerContainer.style.display = "block";
                            }
                            destroyHdrezaPlayer(); // Удаляем плеер
                        }
                        loadVideo(data.video_url, data.playback_position, data.is_playing);
                    }
                    else {
                         if (currentVideoSource !== 'hdrezka') {
                            currentVideoSource = 'hdrezka';
                            document.querySelector('[name="video-source"][value="hdrezka"]').checked = true;
                            playerContainer.style.display = 'none';
                            hdrezkaSearch.style.display = 'block';
                            if(backgroundPlayer) backgroundPlayerContainer.style.display = "none"; // скрываем
                            youtubeSettings.style.display = 'none';
                             if (player) {
                                player.stopVideo(); // Останавилваем плеер
                            }

                        }
                        createHdrezaPlayer(data.video_url); // Создаем плеер
                    }
                } else {
                    // No video URL, potentially clear the player
                    if (currentVideoSource === 'youtube' && player) {
                        player.stopVideo();
                    } else if (currentVideoSource === 'hdrezka') {
                       destroyHdrezaPlayer();
                    }
                }
            }

        } catch (error) {
            console.error('Error getting content updates:', error);
        }
    }

    async function isUserInRoom(roomId, userId) {
        try {
            const response = await authFetch(`/rooms/${roomId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch room data: ${response.status}`);
            }
            const roomData = await response.json();

            return roomData.users.some(user => user.id === userId);

        } catch (error) {
            console.error('Error checking if user is in room:', error);
            return false;
        }
    }

    async function fetchAndDisplayOnlineUsers() {
        try {
            const response = await authFetch(`/rooms/${roomId}/users`);
            if (!response.ok) {
                throw new Error('Failed to fetch online users');
            }
            const data = await response.json();
            displayOnlineUsers(data.users);
        } catch (error) {
            console.error('Error fetching online users:', error);
        }
    }

    // --- session.js --- (Modified part)

    function displayOnlineUsers(users) {
        onlineUsersList.innerHTML = ''; // Clear previous list

        if (users.length === 0) {
            const listItem = document.createElement('li');
            listItem.textContent = 'No users online.';
            onlineUsersList.appendChild(listItem);
            return;
        }

        users.forEach(user => {
            const listItem = document.createElement('li');
            listItem.classList.add('online-user-item'); // Add a class for styling

            const avatar = document.createElement('div');
            avatar.classList.add('online-user-avatar');
            avatar.textContent = user.username.charAt(0).toUpperCase();
            listItem.appendChild(avatar);

            const usernameSpan = document.createElement('span');
            usernameSpan.classList.add('online-user-username');  //for style
            usernameSpan.textContent = user.username;
            listItem.appendChild(usernameSpan);


            onlineUsersList.appendChild(listItem);
        });
    }

    activeSessionsLink.addEventListener('click', async (e) => {
    e.preventDefault();
    activeSessionsPanel.innerHTML = '';
    activeSessionsPanel.style.display = 'block';
    mySessionsPanel.style.display = 'none';

    try {
        const response = await authFetch('/rooms/active');
        if (!response.ok) {
            throw new Error(`Failed to fetch active rooms: ${response.status}`); // Добавил response.status
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
    
            const alreadyInRoom = await isUserInRoom(session.id, currentUserId);
    
            if (alreadyInRoom) {
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
    
    mySessionsLink.addEventListener('click', async (e) => {
        e.preventDefault();
        mySessionsPanel.innerHTML = '';
        mySessionsPanel.style.display = 'block';
        activeSessionsPanel.style.display = 'none';
    
        try {
            const response = await authFetch('/rooms/my');
            if (!response.ok) {
                throw new Error(`Failed to fetch my rooms: ${response.status}`); // Добавил response.status
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
    
                const alreadyInRoom = await isUserInRoom(session.id, currentUserId);
                if (alreadyInRoom) {
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
    
    window.addEventListener('click', (event) => {
        if (!event.target.closest('.message-controls')) {
            document.querySelectorAll('.options-menu').forEach(menu => {
                menu.style.display = 'none';
            });
        }
    });
    setInterval(getContentUpdates, 2000);
    setInterval(fetchAndDisplayMessages, 5000);
    setInterval(fetchAndDisplayOnlineUsers, 10000); // Fetch every 10 seconds
    
    
    function parseJwt(token) {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    
        return JSON.parse(jsonPayload);
    }
});