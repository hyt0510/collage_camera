import * as fs from "fs";
import * as path from "path";

// Read and parse .env.local BEFORE importing firebase-admin
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/\\n/g, "\n");
      }
      process.env[key] = value;
    }
  });
}

import { generateCollageMosaicPlacements } from "../lib/utils/mosaic";

async function seed() {
  const { db } = require("../lib/firebase-admin");

  console.log("Seeding dummy data...");
  const placements = generateCollageMosaicPlacements();
  console.log(`Total placements: ${placements.length}`);

  const old = await db.collection("submissions").get();
  console.log(`Deleting ${old.size} old submissions...`);
  
  const deleteBatch = db.batch();
  let count = 0;
  for (const doc of old.docs) {
    deleteBatch.delete(doc.ref);
    count++;
    if (count % 400 === 0) {
      await deleteBatch.commit();
    }
  }
  if (count % 400 !== 0) {
    await deleteBatch.commit();
  }
  console.log("Deleted old submissions.");

  console.log("Inserting new dummy submissions...");
  let insertBatch = db.batch();
  
  placements.forEach((placement, i) => {
    const ref = db.collection("submissions").doc(`dummy-${i}`);
    const dummyUrl = `https://picsum.photos/seed/collage-${i}/200/300`;
    
    insertBatch.set(ref, {
      userId: "dummy-user",
      templateId: "dummy-template",
      createdAt: new Date().toISOString(),
      status: "approved",
      redeemed: false,
      placement,
      items: [],
      collageImageUrl: dummyUrl
    });
  });

  await insertBatch.commit();
  console.log("Seeded successfully!");
}

seed().catch(console.error);
