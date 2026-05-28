const express = require('express');
const {
  handleSearchLists,
  handleCreateList,
  handleGetListItems,
  handleAddItemToList,
  handleDeleteListItem
} = require('../controllers/clinicListController');

const router = express.Router();

// Search clinic lists
router.post('/search', handleSearchLists);

// Create a new list
router.post('/', handleCreateList);

// Get items in a list
router.get('/:listId/items', handleGetListItems);

// Add an item to a list
router.put('/:listId/items/:clinicId/:clinicName', handleAddItemToList);

// Delete an item from a list
router.delete('/items/:listItemId', handleDeleteListItem);

module.exports = router;
