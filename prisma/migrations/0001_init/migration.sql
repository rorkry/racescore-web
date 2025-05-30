-- CreateTable
CREATE TABLE "entry" (
    "race_id" VARCHAR(20) NOT NULL,
    "horse_number" INTEGER NOT NULL,
    "horse_name" TEXT,
    "finish_position" INTEGER,
    "jockey" TEXT,
    "carried_weight" INTEGER,
    "body_weight" INTEGER,
    "popularity" INTEGER,
    "margin" TEXT,

    CONSTRAINT "entry_pkey" PRIMARY KEY ("race_id","horse_number")
);

-- CreateTable
CREATE TABLE "horse" (
    "horse_name" TEXT NOT NULL,
    "sire" TEXT,
    "dam" TEXT,
    "sex" TEXT,
    "age" INTEGER,

    CONSTRAINT "horse_pkey" PRIMARY KEY ("horse_name")
);

-- CreateTable
CREATE TABLE "race" (
    "race_id" VARCHAR(20) NOT NULL,
    "race_date" DATE,
    "distance" INTEGER,
    "track" TEXT,
    "class_name" TEXT,
    "field_size" INTEGER,

    CONSTRAINT "race_pkey" PRIMARY KEY ("race_id")
);

-- CreateTable
CREATE TABLE "stage_umadata" (
    "id" SERIAL NOT NULL,
    "race_id" TEXT,
    "race_date" DATE,
    "distance" DOUBLE PRECISION,
    "horse_number" DOUBLE PRECISION,
    "horse_name" TEXT,
    "prev_mark3" DOUBLE PRECISION,
    "race_mark3" DOUBLE PRECISION,
    "class_name" TEXT,
    "track_condition" TEXT,
    "finish_position" DOUBLE PRECISION,
    "last3f" DOUBLE PRECISION,
    "finish_time" DOUBLE PRECISION,
    "standard_time" DOUBLE PRECISION,
    "rpci" DOUBLE PRECISION,
    "pci" DOUBLE PRECISION,
    "good_run" DOUBLE PRECISION,
    "pci3" DOUBLE PRECISION,
    "horse_mark" DOUBLE PRECISION,
    "pos_2c" DOUBLE PRECISION,
    "pos_3c" DOUBLE PRECISION,
    "pos_4c" DOUBLE PRECISION,
    "sex" TEXT,
    "age" DOUBLE PRECISION,
    "body_weight" DOUBLE PRECISION,
    "body_weight_diff" DOUBLE PRECISION,
    "carried_weight" DOUBLE PRECISION,
    "jockey" TEXT,
    "multi_entry" DOUBLE PRECISION,
    "region" TEXT,
    "trainer" TEXT,
    "track" TEXT,
    "field_size" DOUBLE PRECISION,
    "popularity" DOUBLE PRECISION,
    "sire" TEXT,
    "margin" DOUBLE PRECISION,
    "pos_2c_1" DOUBLE PRECISION,
    "pos_3c_1" DOUBLE PRECISION,
    "pos_4c_1" DOUBLE PRECISION,

    CONSTRAINT "stage_umadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_umadata_csv" (
    "race_id" TEXT,
    "race_date" TEXT,
    "distance" TEXT,
    "horse_number" TEXT,
    "horse_name" TEXT,
    "mark3_prev" TEXT,
    "mark3" TEXT,
    "class_name" TEXT,
    "track_condition_prev_b" TEXT,
    "finish_position" TEXT,
    "last3f" TEXT,
    "finish_time" TEXT,
    "standard_time" TEXT,
    "rpci" TEXT,
    "pci" TEXT,
    "good_run" TEXT,
    "pci3" TEXT,
    "horse_mark" TEXT,
    "pos_2c_prev_b" TEXT,
    "pos_3c_prev_b" TEXT,
    "pos_4c_prev_b" TEXT,
    "sex" TEXT,
    "age" TEXT,
    "body_weight" TEXT,
    "body_weight_diff" TEXT,
    "carried_weight" TEXT,
    "jockey" TEXT,
    "multi_entry" TEXT,
    "region" TEXT,
    "trainer" TEXT,
    "track_sub_b" TEXT,
    "field_size" TEXT,
    "popularity" TEXT,
    "sire" TEXT,
    "dam" TEXT,
    "track_condition_prev_b_1" TEXT,
    "track_sub_b_1" TEXT,
    "margin" TEXT,
    "pos_1c" TEXT,
    "pos_2c_prev_b_1" TEXT,
    "pos_3c_prev_b_1" TEXT,
    "pos_4c_prev_b_1" TEXT
);

