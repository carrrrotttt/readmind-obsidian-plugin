export interface WeReadRawBook {
  bookId?: string;
  book?: WeReadRawBook;
  title?: string;
  author?: string;
  cover?: string;
  publisher?: string;
  isbn?: string;
  category?: string;
  intro?: string;
  description?: string;
  updateTime?: number;
  readUpdateTime?: number;
  readingStatus?: number;
  bookmarkCount?: number;
  reviewCount?: number;
  noteCount?: number;
  progress?: number;
  readingTimeMinutes?: number;
  sort?: number;
}

export interface WeReadRawBookmark {
  bookmarkId?: string;
  bookId?: string;
  chapterUid?: number | string;
  chapterName?: string;
  markText?: string;
  abstract?: string;
  range?: string;
  createTime?: number;
  updateTime?: number;
}

export interface WeReadRawReview {
  reviewId?: string;
  review?: WeReadRawReview;
  bookId?: string;
  bookmarkId?: string;
  chapterUid?: number | string;
  chapterTitle?: string;
  chapterName?: string;
  content?: string;
  htmlContent?: string;
  abstract?: string;
  text?: string;
  createTime?: number;
  updateTime?: number;
}

export interface WeReadRawChapter {
  chapterUid?: number | string;
  uid?: number | string;
  title?: string;
  chapterName?: string;
}
