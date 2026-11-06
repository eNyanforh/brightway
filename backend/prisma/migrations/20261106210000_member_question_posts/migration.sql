-- Keep legacy POST records while supporting questions as a distinct post type.
ALTER TYPE "MemberPostType" ADD VALUE 'QUESTION';
