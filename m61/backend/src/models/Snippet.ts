import mongoose, { Document, Schema } from 'mongoose';

export interface ISnippet extends Document {
  userId: mongoose.Types.ObjectId;
  ydocId: string;
  title: string;
  language: string;
  snapshot: Buffer;
  version: number;
  lastModifiedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const snippetSchema = new Schema<ISnippet>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  ydocId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  title: {
    type: String,
    default: 'Untitled Snippet'
  },
  language: {
    type: String,
    default: 'javascript'
  },
  snapshot: {
    type: Buffer,
    required: true
  },
  version: {
    type: Number,
    default: 0
  },
  lastModifiedBy: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

snippetSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model<ISnippet>('Snippet', snippetSchema);
