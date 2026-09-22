// Clinic List Management Frontend
// API Base URL
const CLINIC_API_BASE = '/api/clinic-lists';

// State
let currentListId = null;
let currentListData = null;

// DOM Elements
const searchForm = document.getElementById('clinic-list-search-form');
const createListBtn = document.getElementById('create-list-btn');
const createListModal = document.getElementById('create-list-modal');
const createListForm = document.getElementById('create-list-form');
const addItemModal = document.getElementById('add-item-modal');
const addItemForm = document.getElementById('add-item-form');
const listsContainer = document.getElementById('lists-container');
const listItemsSection = document.getElementById('list-items-section');
const listItemsContainer = document.getElementById('list-items-container');
const listItemsTitle = document.getElementById('list-items-title');
const backToListsBtn = document.getElementById('back-to-lists-btn');
const addItemBtn = document.getElementById('add-item-btn');
const messagesContainer = document.getElementById('clinic-list-messages');

// Utility Functions
function showMessage(message, type = 'success') {
  const className = type === 'error' ? 'alert-error' : 'alert-success';
  messagesContainer.innerHTML = `
    <div class="alert ${className}">
      ${message}
    </div>
  `;
  setTimeout(() => {
    messagesContainer.innerHTML = '';
  }, type === 'error' ? 5000 : 3000);
}

function showError(message) {
  showMessage(message, 'error');
}

function showSuccess(message) {
  showMessage(message, 'success');
}

function showLoading(container) {
  container.innerHTML = '<div class="loading">Loading...</div>';
}

// API Functions
async function searchLists(searchData) {
  console.log('[CLINIC-LISTS] 🔍 Searching lists with params:', searchData);
  const response = await fetch(`${CLINIC_API_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(searchData)
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('[CLINIC-LISTS] ❌ Search failed:', error);
    throw new Error(error.error || 'Failed to search lists');
  }
  
  const data = await response.json();
  const lists = data.lists || [];
  console.log('[CLINIC-LISTS] ✅ Found', lists.length, 'lists:', lists);
  console.table(lists.map(l => ({
    id: l.id,
    name: l.name,
    stationId: l.stationId,
    userDefault: l.userDefault,
    role: l.role
  })));
  return lists;
}

async function createList(listData) {
  console.log('[CLINIC-LISTS] ➕ Creating new list:', listData);
  const response = await fetch(`${CLINIC_API_BASE}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(listData)
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('[CLINIC-LISTS] ❌ Create failed:', error);
    throw new Error(error.error || 'Failed to create list');
  }
  
  const data = await response.json();
  console.log('[CLINIC-LISTS] ✅ List created successfully:', data.list);
  return data.list;
}

async function getListItems(listId) {
  console.log('[CLINIC-LISTS] 📋 Getting items for list:', listId);
  const response = await fetch(`${CLINIC_API_BASE}/${listId}/items`);
  
  if (!response.ok) {
    const error = await response.json();
    console.error('[CLINIC-LISTS] ❌ Get items failed:', error);
    throw new Error(error.error || 'Failed to fetch list items');
  }
  
  const data = await response.json();
  const items = data.items || [];
  console.log('[CLINIC-LISTS] ✅ Found', items.length, 'items in list:', items);
  console.table(items.map(i => ({
    id: i.id || i.listItemId,
    clinicId: i.ien || i.clinicId,
    clinicName: i.name || i.clinicName
  })));
  return items;
}

async function addItemToList(listId, clinicId, clinicName, data = {}) {
  console.log('[CLINIC-LISTS] ➕ Adding clinic to list:', { listId, clinicId, clinicName, data });
  const url = `${CLINIC_API_BASE}/${listId}/items/${clinicId}/${encodeURIComponent(clinicName)}`;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('[CLINIC-LISTS] ❌ Add item failed:', error);
    throw new Error(error.error || 'Failed to add item to list');
  }
  
  const result = await response.json();
  console.log('[CLINIC-LISTS] ✅ Clinic added to list:', result.item);
  return result.item;
}

async function deleteListItem(listItemId) {
  console.log('[CLINIC-LISTS] 🗑️ Deleting item from list:', listItemId);
  const response = await fetch(`${CLINIC_API_BASE}/items/${listItemId}`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('[CLINIC-LISTS] ❌ Delete failed:', error);
    throw new Error(error.error || 'Failed to delete item');
  }
  
  const result = await response.json();
  console.log('[CLINIC-LISTS] ✅ Item deleted successfully:', result);
  return result;
}

async function setAsDefault(listId) {
  console.log('[CLINIC-LISTS] ⭐ Setting list as default:', listId);
  const response = await fetch(`${CLINIC_API_BASE}/${listId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userDefault: true })
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('[CLINIC-LISTS] ❌ Set default failed:', error);
    throw new Error(error.error || 'Failed to set as default');
  }
  
  const result = await response.json();
  console.log('[CLINIC-LISTS] ✅ List set as default:', result.list);
  return result.list;
}

// UI Functions
function displayLists(lists) {
  console.log('[CLINIC-LISTS] 🖼️ Displaying', lists?.length || 0, 'lists in UI');
  if (!lists || lists.length === 0) {
    console.log('[CLINIC-LISTS] ℹ️ No lists to display');
    listsContainer.innerHTML = '<p class="text-muted">No lists found</p>';
    return;
  }
  
  // Log summary of what's being displayed
  const defaultLists = lists.filter(l => l.userDefault);
  const stationGroups = lists.reduce((acc, l) => {
    acc[l.stationId] = (acc[l.stationId] || 0) + 1;
    return acc;
  }, {});
  
  console.log('[CLINIC-LISTS] 📊 Display Summary:', {
    totalLists: lists.length,
    defaultLists: defaultLists.length,
    byStation: stationGroups
  });
  
  listsContainer.innerHTML = lists.map(list => `
    <div class="list-card">
      <div onclick="viewListItems('${list.id || ''}', ${JSON.stringify(list).replace(/"/g, '&quot;')})">
        <h3>${list.name || 'Unnamed List'}</h3>
        <p><strong>Station:</strong> ${list.stationId || 'N/A'} | <strong>Role:</strong> ${list.role || 'N/A'}</p>
        ${list.userDefault ? '<span class="tag">Default</span>' : ''}
      </div>
      ${!list.userDefault ? `<button class="btn-secondary" style="margin-top: 10px;" onclick="handleSetAsDefault('${list.id}', event)">Set as Default</button>` : ''}
    </div>
  `).join('');
}

function displayListItems(items) {
  console.log('[CLINIC-LISTS] 🖼️ Displaying', items?.length || 0, 'items in UI');
  if (!items || items.length === 0) {
    console.log('[CLINIC-LISTS] ℹ️ No items to display in list');
    listItemsContainer.innerHTML = '<p class="text-muted">No clinics in this list</p>';
    return;
  }
  
  console.log('[CLINIC-LISTS] 📊 Items being displayed:', items);
  
  listItemsContainer.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Clinic IEN</th>
          <th>Clinic Name</th>
          <th>Item ID</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr>
            <td>${item.ien || item.clinicId || 'N/A'}</td>
            <td>${item.name || item.clinicName || 'N/A'}</td>
            <td>${item.id || item.listItemId || 'N/A'}</td>
            <td>
              <button onclick="deleteItem('${item.id || item.listItemId}')">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function viewListItems(listId, listData) {
  console.log('[CLINIC-LISTS] 👁️ Viewing items for list:', { listId, listData });
  if (!listId) {
    showError('List ID is required');
    return;
  }
  
  currentListId = listId;
  currentListData = typeof listData === 'string' ? JSON.parse(listData) : listData;
  console.log('[CLINIC-LISTS] 📌 Current list data:', currentListData);
  listItemsTitle.textContent = `Items in: ${currentListData.name || listId}`;
  listItemsSection.classList.remove('hidden');
  showLoading(listItemsContainer);
  
  getListItems(listId)
    .then(data => {
      displayListItems(data);
    })
    .catch(error => {
      showError(error.message);
      listItemsContainer.innerHTML = '<p class="text-error">Failed to load items</p>';
    });
}

function deleteItem(listItemId) {
  if (!confirm('Are you sure you want to delete this clinic from the list?')) {
    return;
  }
  
  deleteListItem(listItemId)
    .then(() => {
      showSuccess('Clinic removed from list');
      // Reload items
      getListItems(currentListId)
        .then(data => displayListItems(data))
        .catch(error => showError(error.message));
    })
    .catch(error => {
      showError(error.message);
    });
}

function handleSetAsDefault(listId, event) {
  // Prevent card click from firing
  if (event) {
    event.stopPropagation();
  }
  
  if (!confirm('Set this list as your default? This will unset any other default list.')) {
    return;
  }
  
  console.log('[CLINIC-LISTS] 👆 User clicked Set as Default for list:', listId);
  
  setAsDefault(listId)
    .then(() => {
      showSuccess('List set as default');
      // Refresh the search to update the UI
      if (searchForm) {
        searchForm.dispatchEvent(new Event('submit'));
      }
    })
    .catch(error => {
      showError(error.message);
    });
}

function openModal(modal) {
  modal.classList.add('show');
}

function closeModal(modal) {
  modal.classList.remove('show');
}

// Event Listeners
if (searchForm) {
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(searchForm);
    const searchData = {};
    
    for (let [key, value] of formData.entries()) {
      if (value.trim()) searchData[key] = value.trim();
    }
    
    showLoading(listsContainer);
    
    try {
      const lists = await searchLists(searchData);
      displayLists(lists);
    } catch (error) {
      showError(error.message);
      listsContainer.innerHTML = '<p class="text-muted">Failed to load lists</p>';
    }
  });
}

if (createListBtn) {
  createListBtn.addEventListener('click', () => {
    openModal(createListModal);
  });
}

if (createListForm) {
  createListForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(createListForm);
    const listData = {
      name: formData.get('name'),
      stationId: formData.get('stationId'),
      userDefault: formData.get('userDefault') === 'on'
    };
    
    // Add optional fields
    if (formData.get('userId')) listData.userId = formData.get('userId');
    if (formData.get('role')) listData.role = formData.get('role');
    
    try {
      await createList(listData);
      showSuccess('List created successfully');
      closeModal(createListModal);
      createListForm.reset();
      
      // Refresh the list
      if (searchForm) {
        searchForm.dispatchEvent(new Event('submit'));
      }
    } catch (error) {
      showError(error.message);
    }
  });
}

if (backToListsBtn) {
  backToListsBtn.addEventListener('click', () => {
    listItemsSection.classList.add('hidden');
    currentListId = null;
    currentListData = null;
  });
}

if (addItemBtn) {
  addItemBtn.addEventListener('click', () => {
    if (!currentListId) {
      showError('No list selected');
      return;
    }
    
    document.getElementById('add-list-id').value = currentListId;
    openModal(addItemModal);
  });
}

if (addItemForm) {
  addItemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(addItemForm);
    const listId = formData.get('listId');
    const clinicId = formData.get('clinicId');
    const clinicName = formData.get('clinicName');
    
    try {
      await addItemToList(listId, clinicId, clinicName);
      showSuccess('Clinic added to list');
      closeModal(addItemModal);
      addItemForm.reset();
      
      // Reload items
      getListItems(currentListId)
        .then(data => displayListItems(data))
        .catch(error => showError(error.message));
    } catch (error) {
      showError(error.message);
    }
  });
}

// Modal close handlers
document.querySelectorAll('.simple-modal-close, .modal-cancel').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.simple-modal');
    if (modal) {
      closeModal(modal);
    }
  });
});

// Close modal when clicking outside
document.querySelectorAll('.simple-modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal);
    }
  });
});

// Make viewListItems and deleteItem globally accessible for onclick handlers
window.viewListItems = viewListItems;
window.deleteItem = deleteItem;
window.handleSetAsDefault = handleSetAsDefault;

// Log initialization with helpful debugging info
console.log('%c[CLINIC-LISTS] 📋 Clinic List Management Initialized', 'color: #4CAF50; font-weight: bold; font-size: 14px;');
console.groupCollapsed('%c🔍 Console Logging Guide', 'color: #2196F3; font-weight: bold;');
console.log('All clinic list operations are logged to the console with these emojis:');
console.log('  🔍 = Searching for lists');
console.log('  ➕ = Creating lists or adding items');
console.log('  📋 = Getting list items');
console.log('  🗑️ = Deleting items');
console.log('  ✅ = Operation successful');
console.log('  ❌ = Operation failed');
console.log('  🖼️ = Displaying data in UI');
console.log('  📊 = Summary statistics');
console.log('  📍 = Current state/data');
console.log('\nTip: Use console.table() to view list data in a readable format');
console.log('Tip: Filter console by "[CLINIC-LISTS]" to see only clinic list operations');
console.groupEnd();
