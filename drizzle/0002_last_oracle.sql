CREATE TABLE "dividends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"asset" text NOT NULL,
	"date" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dividends_user_date_idx" ON "dividends" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "dividends_user_asset_date_amount_uq" ON "dividends" USING btree ("user_id","asset","date","amount_cents");