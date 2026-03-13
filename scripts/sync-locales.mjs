import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..");
const sourceDirectory = path.resolve(repoRoot, "src/locales");
const distRoot = path.resolve(repoRoot, "dist");
const targetDirectory = path.resolve(distRoot, "locales");
const isWatchMode = process.argv.includes("--watch");

const getLocaleFiles = () =>
  fs.readdirSync(sourceDirectory).filter((fileName) => fileName.endsWith(".ftl")).sort();

const syncLocales = () => {
  if (!fs.existsSync(sourceDirectory) || !fs.statSync(sourceDirectory).isDirectory()) {
    throw new Error(`Locales source directory not found: ${sourceDirectory}`);
  }

  const localeFiles = getLocaleFiles();
  if (localeFiles.length === 0) {
    throw new Error(`No locale files found in ${sourceDirectory}`);
  }

  fs.mkdirSync(distRoot, { recursive: true });
  fs.mkdirSync(targetDirectory, { recursive: true });

  const staleFiles = fs
    .readdirSync(targetDirectory)
    .filter((fileName) => fileName.endsWith(".ftl") && !localeFiles.includes(fileName));
  for (const staleFile of staleFiles) {
    fs.unlinkSync(path.resolve(targetDirectory, staleFile));
  }

  for (const localeFile of localeFiles) {
    fs.copyFileSync(
      path.resolve(sourceDirectory, localeFile),
      path.resolve(targetDirectory, localeFile),
    );
  }

  const missingFiles = localeFiles.filter(
    (localeFile) => !fs.existsSync(path.resolve(targetDirectory, localeFile)),
  );
  if (missingFiles.length > 0) {
    throw new Error(
      `Locales copy incomplete. Missing in dist/locales: ${missingFiles.join(", ")}`,
    );
  }
};

const runSync = () => {
  syncLocales();
  console.log("Locales synced to dist/locales");
};

runSync();

if (isWatchMode) {
  let syncTimeout = null;
  const scheduleSync = () => {
    if (syncTimeout !== null) {
      clearTimeout(syncTimeout);
    }

    syncTimeout = setTimeout(() => {
      try {
        runSync();
      } catch (error) {
        console.error(error);
      }
    }, 50);
  };

  const sourceWatcher = fs.watch(sourceDirectory, (_eventType, fileName) => {
    if (typeof fileName === "string" && !fileName.endsWith(".ftl")) {
      return;
    }

    scheduleSync();
  });

  const distWatcher = fs.watch(distRoot, (_eventType, fileName) => {
    if (typeof fileName === "string") {
      const normalizedFileName = fileName.replace(/\\/g, "/");
      if (
        normalizedFileName === "locales" ||
        normalizedFileName.startsWith("locales/")
      ) {
        return;
      }
    }

    scheduleSync();
  });

  const closeWatchers = () => {
    sourceWatcher.close();
    distWatcher.close();
  };

  process.on("SIGINT", () => {
    closeWatchers();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    closeWatchers();
    process.exit(0);
  });
}
