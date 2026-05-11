/*
  Warnings:

  - You are about to drop the `OptionValue` table. If the table is not empty, all the data it contains will be lost.
  - The primary key for the `OptionField` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `conditions` on the `OptionField` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `OptionField` table. All the data in the column will be lost.
  - You are about to drop the column `groupId` on the `OptionField` table. All the data in the column will be lost.
  - You are about to drop the column `helpText` on the `OptionField` table. All the data in the column will be lost.
  - You are about to drop the column `key` on the `OptionField` table. All the data in the column will be lost.
  - You are about to drop the column `placeholder` on the `OptionField` table. All the data in the column will be lost.
  - You are about to drop the column `priceType` on the `OptionField` table. All the data in the column will be lost.
  - You are about to drop the column `priceValue` on the `OptionField` table. All the data in the column will be lost.
  - You are about to drop the column `settings` on the `OptionField` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `OptionField` table. All the data in the column will be lost.
  - You are about to alter the column `id` on the `OptionField` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `OptionGroup` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `description` on the `OptionGroup` table. All the data in the column will be lost.
  - You are about to drop the column `settings` on the `OptionGroup` table. All the data in the column will be lost.
  - You are about to drop the column `shop` on the `OptionGroup` table. All the data in the column will be lost.
  - You are about to drop the column `sortOrder` on the `OptionGroup` table. All the data in the column will be lost.
  - You are about to alter the column `id` on the `OptionGroup` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `ProductTarget` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `createdAt` on the `ProductTarget` table. All the data in the column will be lost.
  - You are about to drop the column `groupId` on the `ProductTarget` table. All the data in the column will be lost.
  - You are about to drop the column `rule` on the `ProductTarget` table. All the data in the column will be lost.
  - You are about to drop the column `shopifyHandle` on the `ProductTarget` table. All the data in the column will be lost.
  - You are about to drop the column `shopifyProductId` on the `ProductTarget` table. All the data in the column will be lost.
  - You are about to drop the column `shopifyVariantId` on the `ProductTarget` table. All the data in the column will be lost.
  - You are about to drop the column `sortOrder` on the `ProductTarget` table. All the data in the column will be lost.
  - You are about to drop the column `targetType` on the `ProductTarget` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `ProductTarget` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `ProductTarget` table. All the data in the column will be lost.
  - You are about to alter the column `id` on the `ProductTarget` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - Added the required column `optionGroupId` to the `OptionField` table without a default value. This is not possible if the table is not empty.
  - Added the required column `optionGroupId` to the `ProductTarget` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productId` to the `ProductTarget` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productTitle` to the `ProductTarget` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "OptionValue_fieldId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "OptionValue";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OptionField" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "optionGroupId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "valuesJson" TEXT,
    CONSTRAINT "OptionField_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "OptionGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OptionField" ("id", "label", "required", "sortOrder", "type") SELECT "id", "label", "required", "sortOrder", "type" FROM "OptionField";
DROP TABLE "OptionField";
ALTER TABLE "new_OptionField" RENAME TO "OptionField";
CREATE TABLE "new_OptionGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_OptionGroup" ("createdAt", "id", "name", "status", "updatedAt") SELECT "createdAt", "id", "name", "status", "updatedAt" FROM "OptionGroup";
DROP TABLE "OptionGroup";
ALTER TABLE "new_OptionGroup" RENAME TO "OptionGroup";
CREATE TABLE "new_ProductTarget" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "optionGroupId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    CONSTRAINT "ProductTarget_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "OptionGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProductTarget" ("id") SELECT "id" FROM "ProductTarget";
DROP TABLE "ProductTarget";
ALTER TABLE "new_ProductTarget" RENAME TO "ProductTarget";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
