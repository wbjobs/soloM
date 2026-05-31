const express = require('express');
const DomainService = require('../services/domainService');

const router = express.Router();
const domainService = new DomainService();

domainService.startBlockProduction();

router.post('/register', (req, res) => {
    try {
        const { name, owner_address, gas_price } = req.body;

        if (!name || !owner_address) {
            return res.status(400).json({
                success: false,
                error: 'Name and owner_address are required'
            });
        }

        const gasPrice = gas_price !== undefined ? gas_price : 1;
        const result = domainService.register(name, owner_address, gasPrice);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/resolve/:name', (req, res) => {
    try {
        const { name } = req.params;
        const result = domainService.resolve(name);

        if (!result.success) {
            return res.status(404).json(result);
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/transfer', (req, res) => {
    try {
        const { name, new_owner, signature, nonce, gas_price } = req.body;

        if (!name || !new_owner || !signature || !nonce) {
            return res.status(400).json({
                success: false,
                error: 'name, new_owner, signature, and nonce are required'
            });
        }

        const gasPrice = gas_price !== undefined ? gas_price : 1;
        const result = domainService.transfer(name, new_owner, signature, nonce, gasPrice);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/mempool', (req, res) => {
    try {
        const mempool = domainService.getMempool();
        res.json({
            success: true,
            ...mempool
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/chain', (req, res) => {
    try {
        const chain = domainService.getChain();
        res.json({
            success: true,
            chain
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/block/:index', (req, res) => {
    try {
        const { index } = req.params;
        const block = domainService.getBlock(parseInt(index));

        if (!block) {
            return res.status(404).json({
                success: false,
                error: 'Block not found'
            });
        }

        res.json({
            success: true,
            block
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/info', (req, res) => {
    try {
        const info = domainService.getBlockchainInfo();
        res.json({
            success: true,
            ...info
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/domains', (req, res) => {
    try {
        const domains = domainService.getAllDomains();
        res.json({
            success: true,
            domains
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/verify', (req, res) => {
    try {
        const result = domainService.verifyChain();
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/proof/:blockIndex/:transactionIndex', (req, res) => {
    try {
        const { blockIndex, transactionIndex } = req.params;
        const proof = domainService.getTransactionProof(
            parseInt(blockIndex),
            parseInt(transactionIndex)
        );

        if (!proof) {
            return res.status(404).json({
                success: false,
                error: 'Proof not found'
            });
        }

        res.json({
            success: true,
            proof
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
