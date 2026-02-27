
import { updateSubmissionStatus } from '../../../../src/lib/storage';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const password = request.headers.get('x-admin-password');
  
  if (password !== process.env.ADMIN_PASSWORD) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const { status } = body;
  
  if (status !== 'approved' && status !== 'rejected') {
    return Response.json({ error: 'Invalid status' }, { status: 400 });
  }
  
  const updatedSubmission = await updateSubmissionStatus(id, status);
  
  if (!updatedSubmission) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  
  return Response.json(updatedSubmission);
}

