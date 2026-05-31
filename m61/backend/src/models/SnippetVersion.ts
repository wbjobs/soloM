import mongoose, { Document, Schema } from 'mongoose';

export interface ISnippetVersion extends Document {
  ydocId: string;
  userId: mongoose.Types.ObjectId;
  snapshot: Buffer;
  title: string;
  language: string;
  version: number;
  modifiedBy: string;
  description: string;
  createdAt: Date;
}

const snippetVersionSchema = new Schema<ISnippetVersion>({
  ydocId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  snapshot: {
    type: Buffer,
    required: true
  },
  title: {
    type: String,
    default: ''
  },
  language: {
    type: String,
    default: 'javascript'
  },
  version: {
    type: Number,
    required: true
  },
  modifiedBy: {
    type: String,
    default: 'unknown'
  },
  description: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

snippetVersionSchema.index({ ydocId: 1, version: -1 });

export default mongoose.model<ISnippetVersion>('SnippetVersion', snippetVersionSchema);
