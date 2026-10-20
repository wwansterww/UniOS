-- Generated from lib/db/migrations.ts (004_credits). Do not edit by hand.
-- Credits of a course weigh it in the student's GPA.
alter table courses add column credits int not null default 5 check (credits between 1 and 30);
