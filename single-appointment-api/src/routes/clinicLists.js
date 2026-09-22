import express from 'express';
import {
  handleSearchLists,
  handleCreateList,
  handleUpdateList,
  handleGetListItems,
  handleAddItemToList,
  handleDeleteListItem
} from '../controllers/clinicListController.js';

const router = express.Router();

// Search clinic lists
router.post('/search', handleSearchLists);

// Create a new list
router.post('/', handleCreateList);

// Update a list (e.g., set as default)
router.put('/:listId', handleUpdateList);

// Get items in a list
router.get('/:listId/items', handleGetListItems);

// Add an item to a list
router.put('/:listId/items/:clinicId/:clinicName', handleAddItemToList);

// Delete an item from a list
router.delete('/items/:listItemId', handleDeleteListItem);

export default router;
