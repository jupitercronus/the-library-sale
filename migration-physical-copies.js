// migration-physical-copies.js
// Run this ONCE to migrate existing data

// Firebase is already initialized by migration.html

// Migration state tracking
let migrationStats = {
    usersProcessed: 0,
    interactionsProcessed: 0,
    physicalCopiesCreated: 0,
    errors: 0,
    skipped: 0,
    startTime: null,
    endTime: null
};

// Generate unique identifier for physical copies
function generateUniqueIdentifier(barcode, format, edition, region) {
    const normalizedFormat = (format || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedEdition = (edition || 'Standard').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedRegion = (region || 'Region1').toLowerCase().replace(/[^a-z0-9]/g, '');
    
    return `${barcode}_${normalizedFormat}_${normalizedEdition}_${normalizedRegion}`;
}

// Extract and normalize physical edition data from user interaction
function extractPhysicalEditionData(userInteraction) {
    const physicalEdition = userInteraction.physicalEdition || {};
    const upc = userInteraction.upc || '';
    
    // Skip if no meaningful physical data
    if (!upc && !physicalEdition.format && !physicalEdition.edition) {
        return null;
    }
    
    return {
        movieId: userInteraction.movieId,
        barcode: upc,
        format: physicalEdition.format || 'Unknown',
        edition: physicalEdition.edition || 'Standard',
        region: physicalEdition.region || 'Region 1',
        distributor: physicalEdition.distributor || '',
        features: Array.isArray(physicalEdition.features) ? physicalEdition.features : 
                 (physicalEdition.features ? [physicalEdition.features] : []),
        userId: userInteraction.userId,
        userInteractionRef: userInteraction.ref
    };
}

// Update progress display
function updateProgress(message, isError = false) {
    const progressDiv = document.getElementById('progress');
    const timestamp = new Date().toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = isError ? 'log-error' : 'log-info';
    logEntry.innerHTML = `[${timestamp}] ${message}`;
    
    progressDiv.appendChild(logEntry);
    progressDiv.scrollTop = progressDiv.scrollHeight;
    
    console.log(`[MIGRATION] ${message}`);
}

// Check if physical copy already exists
async function findExistingPhysicalCopy(uniqueIdentifier) {
    try {
        const existingQuery = await db.collection('physicalCopies')
            .where('uniqueIdentifier', '==', uniqueIdentifier)
            .limit(1)
            .get();
        
        return existingQuery.empty ? null : {
            id: existingQuery.docs[0].id,
            data: existingQuery.docs[0].data()
        };
    } catch (error) {
        console.error('Error finding existing physical copy:', error);
        return null;
    }
}

// Create new physical copy document
async function createPhysicalCopy(physicalData, batch) {
    const uniqueId = generateUniqueIdentifier(
        physicalData.barcode,
        physicalData.format,
        physicalData.edition,
        physicalData.region
    );
    
    // Check if already exists
    const existing = await findExistingPhysicalCopy(uniqueId);
    if (existing) {
        return existing.id;
    }
    
    const copyData = {
        movieId: physicalData.movieId,
        barcode: physicalData.barcode || '',
        format: physicalData.format || 'Unknown',
        edition: physicalData.edition || 'Standard',
        region: physicalData.region || 'Region 1',
        distributor: physicalData.distributor || '',
        features: physicalData.features || [],
        uniqueIdentifier: uniqueId,
        dateFirstScanned: firebase.firestore.FieldValue.serverTimestamp(),
        scannedBy: physicalData.userId,
        scanCount: 1,
        migratedFrom: 'legacy_data'
    };
    
    const newCopyRef = db.collection('physicalCopies').doc();
    batch.set(newCopyRef, copyData);
    
    return newCopyRef.id;
}

// Main migration function
async function migratePhysicalCopies() {
    migrationStats.startTime = new Date();
    updateProgress('🚀 Starting physical copies migration...');
    
    try {
        // Step 1: Get all users
        updateProgress('📋 Fetching all users...');
        const usersSnapshot = await db.collection('users').get();
        updateProgress(`Found ${usersSnapshot.size} users to process`);
        
        // Step 2: Process each user's movie interactions
        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            updateProgress(`👤 Processing user: ${userId}`);
            migrationStats.usersProcessed++;
            
            try {
                // Get all movie interactions for this user
                const interactionsSnapshot = await db.collection('users')
                    .doc(userId)
                    .collection('movieInteractions')
                    .get();
                
                if (interactionsSnapshot.empty) {
                    updateProgress(`  ↳ No interactions found for user ${userId}`);
                    continue;
                }
                
                // Group interactions that need migration
                const interactionsToMigrate = [];
                
                for (const interactionDoc of interactionsSnapshot.docs) {
                    const interactionData = interactionDoc.data();
                    
                    // Skip if already has physicalCopies array
                    if (interactionData.physicalCopies && interactionData.physicalCopies.length > 0) {
                        migrationStats.skipped++;
                        continue;
                    }
                    
                    // Skip if not owned or no physical data
                    if (!interactionData.owned) {
                        continue;
                    }
                    
                    const physicalData = extractPhysicalEditionData({
                        ...interactionData,
                        userId: userId,
                        ref: interactionDoc.ref
                    });
                    
                    if (physicalData) {
                        interactionsToMigrate.push({
                            interactionRef: interactionDoc.ref,
                            interactionData: interactionData,
                            physicalData: physicalData
                        });
                    }
                }
                
                if (interactionsToMigrate.length === 0) {
                    updateProgress(`  ↳ No interactions need migration for user ${userId}`);
                    continue;
                }
                
                updateProgress(`  ↳ Found ${interactionsToMigrate.length} interactions to migrate`);
                
                // Process in batches of 10 to avoid transaction limits
                const batchSize = 10;
                for (let i = 0; i < interactionsToMigrate.length; i += batchSize) {
                    const batch = db.batch();
                    const batchItems = interactionsToMigrate.slice(i, i + batchSize);
                    
                    for (const item of batchItems) {
                        try {
                            // Create physical copy
                            const physicalCopyId = await createPhysicalCopy(item.physicalData, batch);
                            
                            // Update user interaction with physicalCopies array
                            const updatedData = {
                                ...item.interactionData,
                                physicalCopies: [physicalCopyId],
                                // Keep legacy fields for backward compatibility
                                migrationDate: firebase.firestore.FieldValue.serverTimestamp()
                            };
                            
                            batch.update(item.interactionRef, updatedData);
                            
                            migrationStats.interactionsProcessed++;
                            migrationStats.physicalCopiesCreated++;
                            
                        } catch (error) {
                            migrationStats.errors++;
                            updateProgress(`    ❌ Error processing interaction: ${error.message}`, true);
                        }
                    }
                    
                    // Commit batch
                    await batch.commit();
                    updateProgress(`    ✅ Processed batch ${Math.floor(i/batchSize) + 1} for user ${userId}`);
                }
                
            } catch (error) {
                migrationStats.errors++;
                updateProgress(`❌ Error processing user ${userId}: ${error.message}`, true);
            }
        }
        
        migrationStats.endTime = new Date();
        const duration = (migrationStats.endTime - migrationStats.startTime) / 1000;
        
        updateProgress('🎉 Migration completed successfully!');
        updateProgress(`📊 Final Statistics:`);
        updateProgress(`  • Users processed: ${migrationStats.usersProcessed}`);
        updateProgress(`  • Interactions migrated: ${migrationStats.interactionsProcessed}`);
        updateProgress(`  • Physical copies created: ${migrationStats.physicalCopiesCreated}`);
        updateProgress(`  • Items skipped (already migrated): ${migrationStats.skipped}`);
        updateProgress(`  • Errors encountered: ${migrationStats.errors}`);
        updateProgress(`  • Total duration: ${duration.toFixed(2)} seconds`);
        
        // Store migration log in database
        await db.collection('migrations').add({
            type: 'physical_copies_migration',
            stats: migrationStats,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        updateProgress('✅ Migration log saved to database');
        
    } catch (error) {
        updateProgress(`💥 Fatal migration error: ${error.message}`, true);
        console.error('Migration failed:', error);
    }
}
// Run immediately when script loads (DOM is already ready)
console.log('Migration script executing...');
updateProgress('Migration script loaded and ready.');

// Add start button
const progressDiv = document.getElementById('progress');
if (progressDiv) {
    const startButton = document.createElement('button');
    startButton.textContent = 'Start Migration';
    startButton.className = 'btn btn-lg btn-primary';
    startButton.style.margin = '20px 0';
    
    startButton.onclick = () => {
        console.log('Start migration button clicked');
        startButton.disabled = true;
        startButton.textContent = 'Migration Running...';
        
        migratePhysicalCopies()
            .then(() => {
                console.log('Migration completed successfully');
            })
            .catch((error) => {
                console.error('Migration failed:', error);
                updateProgress(`💥 Migration failed: ${error.message}`, true);
            })
            .finally(() => {
                startButton.textContent = 'Migration Complete';
            });
    };
    
    progressDiv.parentNode.insertBefore(startButton, progressDiv);
    console.log('Migration button added to page');
} else {
    console.error('Could not find progress div');
}