/**
 * 
 */
package transcode;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URISyntaxException;
import java.security.InvalidKeyException;
import org.json.*;

import com.microsoft.azure.storage.CloudStorageAccount;
import com.microsoft.azure.storage.StorageException;
import com.microsoft.azure.storage.blob.CloudBlobClient;
import com.microsoft.azure.storage.blob.CloudBlobContainer;
import com.microsoft.azure.storage.blob.CloudBlockBlob;
import com.microsoft.azure.storage.queue.CloudQueue;
import com.microsoft.azure.storage.queue.CloudQueueClient;
import com.microsoft.azure.storage.queue.CloudQueueMessage;

/**
 * @author seguler
 *
 */
public class App {
	static final String blobEndpoint = "https://build2018demo.blob.core.windows.net/web/videos/";
	static final String blobDirectory = "transcoded/";

	/**
	 * @param args
	 * @throws URISyntaxException 
	 * @throws InvalidKeyException 
	 * @throws StorageException 
	 */
	public static void main(String[] args) throws InvalidKeyException, URISyntaxException, StorageException {
		
		String connString = System.getenv("CONNECTION_STRING");
		if(connString == null)
		{
			System.err.println("No connection string. Pass connection string in env variable CONNECTION_STRING");
			System.exit(1);
		}
		
		try {
			CloudStorageAccount account = CloudStorageAccount.parse(connString);		
			CloudQueueClient queueClient = account.createCloudQueueClient();
			CloudQueue queue = queueClient.getQueueReference("transcodeworker");
			CloudQueueMessage message = null;
			
			while(true){
				
				message = queue.retrieveMessage();
				
				if(message == null){
					try {
						Thread.sleep(1000);
					} catch (InterruptedException e) {
						// TODO Auto-generated catch block
						e.printStackTrace();
					}
					continue;
				}
				
				System.out.println(message.getMessageContentAsString());
				JSONObject obj = new JSONObject(message.getMessageContentAsString());
				
				String blobName = obj.getJSONObject("data").getString("url").split("videos/")[1];
				System.out.println("Handling video: " + blobName);
				
				// Download the video
				download(account, blobName);
				
				// Transcode, and upload the file if successful
				if(transcode(blobName)){
					upload(account, blobName);
				}
				
				// Clean up files, and the message
				File downloadedFile = new File(blobName);
				downloadedFile.delete();
				queue.deleteMessage(message);
			
			}
		
		} catch (StorageException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (URISyntaxException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}
		
	}
	
	private static boolean upload(CloudStorageAccount account, String videoName){
		try {
			CloudBlobClient blobClient = account.createCloudBlobClient();
			CloudBlobContainer container = blobClient.getContainerReference("web");
			CloudBlockBlob blob = container.getBlockBlobReference(blobDirectory + videoName);
			System.out.println("Uploading from file output.mp4");
			blob.uploadFromFile("output.mp4");
			
			File downloaded = new File(videoName);
			downloaded.delete();
			
			return true;
		} catch (StorageException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (IOException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (URISyntaxException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}
		return false;
	}
	
	private static boolean download(CloudStorageAccount account, String videoName){
		try {
			CloudBlobClient client = account.createCloudBlobClient();
			CloudBlobContainer container = client.getContainerReference("web");
			CloudBlockBlob blob = container.getBlockBlobReference("videos/" + videoName);
			System.out.println("Downloading " + blob.getName());
			blob.downloadToFile(videoName);
			
			return true;
		} catch (StorageException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (IOException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (URISyntaxException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}
		return false;
	}
	
	private static boolean transcode(String source){
		
		try {
		
			String cmd="ffmpeg -y -i " + source + " -vcodec h264 -acodec aac -strict -2 output.mp4";
	        
			System.out.println("Kicking off ffmpeg command: ");
			System.out.println(cmd);
			
	        Process run_ffmpeg = Runtime.getRuntime().exec(cmd);
	        run_ffmpeg.waitFor();
	
	        BufferedReader stdin = new BufferedReader(new InputStreamReader(run_ffmpeg.getInputStream()));
	        BufferedReader stderr = new BufferedReader(new InputStreamReader(run_ffmpeg.getErrorStream()));
	
	        String output;
			while ((output = stdin.readLine()) != null) {
	        	System.out.println(output);
	        }
	
	        while ((output = stderr.readLine()) != null) {
	        	System.out.println(output);
	        }
	        
	        return true;
	        
		}
		catch (IOException | InterruptedException e) {
			System.out.println("Failed to transcode with ffmpeg:");
			e.printStackTrace();
			System.exit(1);
		}
		return false;

	}

}
