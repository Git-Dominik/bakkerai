CREATE TABLE "SvhRecipeCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "theme" TEXT NOT NULL,
    "name" TEXT NOT NULL
);

CREATE UNIQUE INDEX "SvhRecipeCategory_theme_name_key" ON "SvhRecipeCategory"("theme", "name");

CREATE TABLE "SvhRecipe" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "personSize" TEXT NOT NULL,
    "intro" TEXT,
    "imageUrl" TEXT,
    "blocksJson" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    CONSTRAINT "SvhRecipe_theme_category_fkey" FOREIGN KEY ("theme", "category") REFERENCES "SvhRecipeCategory" ("theme", "name") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SvhRecipe_slug_key" ON "SvhRecipe"("slug");

CREATE TABLE "SvhLessonPage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "topic" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "pagesAvailable" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "magazine" TEXT NOT NULL
);

CREATE UNIQUE INDEX "SvhLessonPage_topic_item_page_key" ON "SvhLessonPage"("topic", "item", "page");
