import Router from '@koa/router';
import { createFile, getFiles, getFile, completeFile, removeFile, getChunkStatus, getAdminStats } from '../controllers/fileController.ts';
import { uploadChunk, downloadChunk } from '../controllers/chunkController.ts';
import { createShare, getShareInfo, verifySharePassword } from '../controllers/shareController.ts';
import { emergencyDestroy, getDestroyHistory } from '../controllers/destroyController.ts';

const router = new Router({ prefix: '/api' });

router.post('/files', createFile);
router.get('/files', getFiles);
router.get('/files/:id', getFile);
router.get('/files/:id/chunk-status', getChunkStatus);
router.put('/files/:id/complete', completeFile);
router.delete('/files/:id', removeFile);

router.post('/files/:fileId/chunks/:index', uploadChunk);
router.get('/files/:fileId/chunks/:index', downloadChunk);

router.post('/shares', createShare);
router.get('/shares/:id', getShareInfo);
router.post('/shares/:id/verify', verifySharePassword);

router.post('/admin/destroy/:id', emergencyDestroy);
router.get('/admin/destroy-history', getDestroyHistory);
router.get('/admin/stats', getAdminStats);

export default router;
