import { https } from 'follow-redirects';
import fs from 'fs-extra';
import fetch from 'node-fetch';

export async function download(
	url: string,
	filePath: string,
	showProgress = false,
	name = '',
	headers?: Record< string, string >
) {
	const file = fs.createWriteStream( filePath );

	if ( headers && Object.keys( headers ).length > 0 ) {
		// Use node-fetch for authenticated downloads
		const response = await fetch( url, { headers } );
		if ( ! response.ok ) {
			throw new Error( `Request failed with status code: ${ response.status }` );
		}
		const totalSize = Number( response.headers.get( 'content-length' ) );
		let downloadedSize = 0;
		const showDownloadProgress =
			showProgress && typeof process.stdout.clearLine === 'function' && ! isNaN( totalSize );
		if ( showDownloadProgress ) {
			response.body.on( 'data', ( chunk: Buffer ) => {
				downloadedSize += chunk.length;
				const progress = ( ( downloadedSize / totalSize ) * 100 ).toFixed( 2 );
				process.stdout.clearLine( 0 );
				process.stdout.cursorTo( 0 );
				process.stdout.write( `[${ name }] ${ progress }%` );
			} );
		}
		await new Promise< void >( ( resolve, reject ) => {
			response.body.pipe( file );
			response.body.on( 'end', () => {
				if ( showDownloadProgress ) {
					console.log();
				}
				file.close( () => resolve() );
			} );
			response.body.on( 'error', ( err: Error ) => reject( err ) );
		} );
		return;
	}

	// Fallback to https.get for public downloads
	await new Promise< void >( ( resolve, reject ) => {
		https.get( url, ( response ) => {
			if ( response.statusCode !== 200 ) {
				reject( new Error( `Request failed with status code: ${ response.statusCode }` ) );
				return;
			}

			const totalSize = parseInt( response.headers[ 'content-length' ] ?? '', 10 );
			let downloadedSize = 0;
			const showDownloadProgress =
				showProgress && typeof process.stdout.clearLine === 'function' && ! isNaN( totalSize );
			if ( showDownloadProgress ) {
				response.on( 'data', ( chunk ) => {
					downloadedSize += chunk.length;
					const progress = ( ( downloadedSize / totalSize ) * 100 ).toFixed( 2 );
					process.stdout.clearLine( 0 );
					process.stdout.cursorTo( 0 );
					process.stdout.write( `[${ name }] ${ progress }%` );
				} );
			}

			response.pipe( file );
			response.on( 'end', () => {
				if ( showDownloadProgress ) {
					console.log();
				}
				file.close( () => resolve() );
			} );
			response.on( 'error', ( err ) => reject( err ) );
		} );
	} );
}
