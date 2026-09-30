import { uploadImage } from '../../middlewares/upload';
import { ApiRouter, idParams } from '../../utils/router';
import * as c from './controller';
import * as s from './schema';

const r = new ApiRouter('/inventory', 'Inventory');
r.get('/categories', { summary: 'List inventory categories' }, c.listCategories);
r.post(
  '/categories',
  { summary: 'Create category', status: 201, schemas: { body: s.categoryBody } },
  c.createCategory,
);
r.patch(
  '/categories/:id',
  { summary: 'Update category', schemas: { params: idParams, body: s.categoryUpdateBody } },
  c.updateCategory,
);
r.delete(
  '/categories/:id',
  { summary: 'Delete an empty category', schemas: { params: idParams } },
  c.deleteCategory,
);

r.get('/suppliers', { summary: 'List suppliers', schemas: { query: s.supplierListQuery } }, c.listSuppliers);
r.post(
  '/suppliers',
  { summary: 'Create supplier', status: 201, schemas: { body: s.supplierBody } },
  c.createSupplier,
);
r.patch(
  '/suppliers/:id',
  { summary: 'Update supplier', schemas: { params: idParams, body: s.supplierUpdateBody } },
  c.updateSupplier,
);
r.delete('/suppliers/:id', { summary: 'Delete supplier', schemas: { params: idParams } }, c.deleteSupplier);

r.get(
  '/items',
  { summary: 'List / export items (format=json|xlsx|pdf)', schemas: { query: s.itemListQuery } },
  c.listItems,
);
r.post(
  '/items',
  { summary: 'Create item (optional opening stock)', status: 201, schemas: { body: s.itemBody } },
  c.createItem,
);
r.get(
  '/items/:id',
  { summary: 'Item details with movement history', schemas: { params: idParams } },
  c.getItem,
);
r.patch(
  '/items/:id',
  { summary: 'Update item', schemas: { params: idParams, body: s.itemUpdateBody } },
  c.updateItem,
);
r.delete(
  '/items/:id',
  {
    summary: 'Delete item (soft; ?hard=true super admin only)',
    schemas: { params: idParams, query: s.deleteQuery },
  },
  c.deleteItem,
);
r.post(
  '/items/:id/image',
  {
    summary: 'Upload item image',
    pre: [uploadImage('inventory')],
    multipart: { file: 'file' },
    schemas: { params: idParams },
  },
  c.uploadImage,
);

r.get(
  '/movements',
  { summary: 'List / export stock movements', schemas: { query: s.movementListQuery } },
  c.listMovements,
);
r.post(
  '/movements',
  {
    summary: 'Record stock in / out / adjustment / damaged / return',
    status: 201,
    schemas: { body: s.movementBody },
  },
  c.recordMovement,
);
r.get('/alerts', { summary: 'Low-stock and expiry alerts' }, c.alerts);

export default r;
