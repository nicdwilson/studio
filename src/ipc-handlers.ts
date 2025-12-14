import { exec, ExecOptions } from 'child_process';
import crypto from 'crypto';
import {
	BrowserWindow,
	app,
	clipboard,
	dialog,
	shell,
	type IpcMainInvokeEvent,
	Notification,
	SaveDialogOptions,
} from 'electron';
import fs from 'fs';
import fsPromises from 'fs/promises';
import https from 'node:https';
import os from 'os';
import nodePath from 'path';
import * as Sentry from '@sentry/electron/main';
import { __, LocaleData, defaultI18n } from '@wordpress/i18n';
import archiver from 'archiver';
import fetch from 'node-fetch';
import { calculateDirectorySize, isWordPressDirectory, arePathsEqual } from 'common/lib/fs-utils';
import { SupportedLocale } from 'common/lib/locale';
import { getAuthenticationUrl } from 'common/lib/oauth';
import { Snapshot } from 'common/types/snapshot';
import { StatsGroup, StatsMetric } from 'common/types/stats';
import { ARCHIVER_OPTIONS, DEFAULT_TERMINAL, MAIN_MIN_WIDTH, SIDEBAR_WIDTH } from 'src/constants';
import { sendIpcEventToRenderer, sendIpcEventToRendererWithWindow } from 'src/ipc-utils';
import { ACTIVE_SYNC_OPERATIONS } from 'src/lib/active-sync-operations';
import { bumpStat } from 'src/lib/bump-stats';
import { getImporterMetric } from 'src/lib/bump-stats/lib';
import {
	openCertificate as openCertificateDialog,
	isRootCATrusted,
	trustRootCA,
} from 'src/lib/certificate-manager';
import { download } from 'src/lib/download';
import { isEmptyDir, pathExists, sanitizeFolderName } from 'src/lib/fs-utils';
import { getImageData } from 'src/lib/get-image-data';
import { getSiteUrl } from 'src/lib/get-site-url';
import { getSyncBackupTempPath } from 'src/lib/get-sync-backup-temp-path';
import { exportBackup } from 'src/lib/import-export/export/export-manager';
import { ExportOptions } from 'src/lib/import-export/export/types';
import { ImportExportEventData } from 'src/lib/import-export/handle-events';
import { defaultImporterOptions, importBackup } from 'src/lib/import-export/import/import-manager';
import { BackupArchiveInfo } from 'src/lib/import-export/import/types';
import { isErrnoException } from 'src/lib/is-errno-exception';
import { isInstalled } from 'src/lib/is-installed';
import { getUserLocaleWithFallback } from 'src/lib/locale-node';
import * as oauthClient from 'src/lib/oauth';
import { getSignUpUrl } from 'src/lib/oauth';
import { createPassword } from 'src/lib/passwords';
import { phpGetThemeDetails } from 'src/lib/php-get-theme-details';
import { portFinder } from 'src/lib/port-finder';
import { shellOpenExternalWrapper } from 'src/lib/shell-open-external-wrapper';
import { sortSites } from 'src/lib/sort-sites';
import { installSqliteIntegration, keepSqliteIntegrationUpdated } from 'src/lib/sqlite-versions';
import { updateSiteUrl } from 'src/lib/update-site-url';
import * as windowsHelpers from 'src/lib/windows-helpers';
import { getLogsFilePath, writeLogToFile, type LogLevel } from 'src/logging';
import { getMainWindow } from 'src/main-window';
import { popupMenu, setupMenu } from 'src/menu';
import { executePreviewCliCommand } from 'src/modules/cli/lib/execute-preview-command';
import { supportedEditorConfig, SupportedEditor } from 'src/modules/user-settings/lib/editor';
import { SupportedTerminal } from 'src/modules/user-settings/lib/terminal';
import { winFindEditorPath } from 'src/modules/user-settings/lib/win-editor-path';
import { UserSettingsTabName } from 'src/modules/user-settings/user-settings-types';
import { SiteServer, createSiteWorkingDirectory } from 'src/site-server';
import { DEFAULT_SITE_PATH, getSiteThumbnailPath } from 'src/storage/paths';
import {
	loadUserData,
	lockAppdata,
	saveUserData,
	unlockAppdata,
	updateAppdata,
} from 'src/storage/user-data';
import { DEFAULT_PHP_VERSION, DEFAULT_WORDPRESS_VERSION } from 'vendor/wp-now/src/constants';
import { serializeForWordPress } from './lib/serialize-plugins';
import { convertMySqlToSqlite } from './lib/sqlite-conversion';
import { setupMySQLSite, dropMySQLDatabaseIfExists } from './modules/mysql-support/lib/site-manager';
import { testMySQLConnection as testMySQLConnectionLib } from './modules/mysql-support/lib/database-operations';
import * as fsExtra from 'fs-extra';
import type { SyncSite } from 'src/hooks/use-fetch-wpcom-sites/types';
import type { WpCliResult } from 'src/lib/wp-cli-process';

const TEMP_DIR = nodePath.join( app.getPath( 'temp' ), 'com.wordpress.studio' ) + nodePath.sep;
if ( ! fs.existsSync( TEMP_DIR ) ) {
	fs.mkdirSync( TEMP_DIR );
}

async function sendThumbnailChangedEvent( event: IpcMainInvokeEvent, id: string ) {
	if ( event.sender.isDestroyed() ) {
		return;
	}
	const thumbnailData = await getThumbnailData( event, id );
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	sendIpcEventToRendererWithWindow( parentWindow, 'thumbnail-changed', {
		id,
		imageData: thumbnailData,
	} );
}

function mergeSiteDetailsWithRunningDetails( sites: SiteDetails[] ): SiteDetails[] {
	return sites.map( ( site ) => {
		const server = SiteServer.get( site.id );
		if ( server ) {
			return server.details;
		}
		return site;
	} );
}

export async function getSiteDetails( _event: IpcMainInvokeEvent ): Promise< SiteDetails[] > {
	const userData = await loadUserData();

	const { sites } = userData;

	// Ensure we have an instance of a server for each site we know about
	for ( const site of sites ) {
		if ( ! SiteServer.get( site.id ) && ! site.running ) {
			SiteServer.create( site );
		}
	}

	return mergeSiteDetailsWithRunningDetails( sites );
}

export function getInstalledAppsAndTerminals(): InstalledApps {
	return {
		vscode: isInstalled( 'vscode' ),
		phpstorm: isInstalled( 'phpstorm' ),
		webstorm: isInstalled( 'webstorm' ),
		windsurf: isInstalled( 'windsurf' ),
		cursor: isInstalled( 'cursor' ),
		terminal: true, // Terminal.app is always available on macOS
		iterm: isInstalled( 'iterm' ),
		warp: isInstalled( 'warp' ),
		ghostty: isInstalled( 'ghostty' ),
	};
}

export async function importSite(
	event: IpcMainInvokeEvent,
	{ id, backupFile }: { id: string; backupFile: BackupArchiveInfo }
): Promise< SiteDetails > {
	const site = SiteServer.get( id );
	if ( ! site ) {
		throw new Error( 'Site not found.' );
	}
	try {
		const onEvent = ( data: ImportExportEventData ) => {
			const parentWindow = BrowserWindow.fromWebContents( event.sender );
			sendIpcEventToRendererWithWindow( parentWindow, 'on-import', data, id );
		};
		const result = await importBackup( backupFile, site.details, onEvent, defaultImporterOptions );

		bumpStat( StatsGroup.STUDIO_IMPORT, getImporterMetric( result.importerType ) );

		if ( result?.meta?.phpVersion ) {
			site.details.phpVersion = result.meta.phpVersion;
		}
		return site.details;
	} catch ( e ) {
		bumpStat( StatsGroup.STUDIO_IMPORT, StatsMetric.FAILURE );
		Sentry.captureException( e );
		throw e;
	}
}

export async function createSite(
	event: IpcMainInvokeEvent,
	path: string,
	siteName?: string,
	wpVersion?: string,
	customDomain?: string,
	enableHttps?: boolean,
	siteId?: string,
	useMySQL?: boolean
): Promise< SiteDetails > {
	console.log( `[MySQL] createSite called with useMySQL: ${ useMySQL }` );
	const forceSetupSqlite = false;
	// We only recursively create the directory if the user has not selected a
	// path from the dialog (and thus they use the "default" or suggested path).
	if ( ! ( await pathExists( path ) ) && path.startsWith( DEFAULT_SITE_PATH ) ) {
		fs.mkdirSync( path, { recursive: true } );
	}

	if ( ! ( await isEmptyDir( path ) ) && ! isWordPressDirectory( path ) ) {
		// Form validation should've prevented a non-empty directory from being selected
		throw new Error( 'The selected directory is not empty nor an existing WordPress site.' );
	}
	let userData = await loadUserData();

	const allPaths = userData?.sites?.map( ( site ) => site.path ) || [];
	if ( allPaths.includes( path ) ) {
		throw new Error( 'The selected directory is already in use.' );
	}

	if ( ( await pathExists( path ) ) && ( await isEmptyDir( path ) ) ) {
		try {
			await createSiteWorkingDirectory( path, wpVersion );
		} catch ( error ) {
			// If site creation failed, remove the generated files and re-throw the
			// error so it can be handled by the caller.
			await shell.trashItem( path );
			throw error;
		}
	}

	const port = await portFinder.getOpenPort();

	const details = {
		id: siteId || crypto.randomUUID(),
		name: siteName || nodePath.basename( path ),
		path,
		adminPassword: createPassword(),
		port,
		running: false,
		phpVersion: DEFAULT_PHP_VERSION,
		isWpAutoUpdating: wpVersion === DEFAULT_WORDPRESS_VERSION,
		customDomain,
		enableHttps,
	} as const;

	const server = SiteServer.create( details, { wpVersion } );

	// Handle standard WordPress setup first
	if ( isWordPressDirectory( path ) ) {
		// If the directory contains a WordPress installation, and user wants to force SQLite
		// integration, let's rename the wp-config.php file to allow WP Now to create a new one
		// and initialize things properly.
		if ( forceSetupSqlite && ( await pathExists( nodePath.join( path, 'wp-config.php' ) ) ) ) {
			fs.renameSync(
				nodePath.join( path, 'wp-config.php' ),
				nodePath.join( path, 'wp-config-studio.php' )
			);
		}

		if ( ! ( await pathExists( nodePath.join( path, 'wp-config.php' ) ) ) ) {
			await installSqliteIntegration( path );
		} else {
			await updateSiteUrl( server, getSiteUrl( details ) );
		}
	}

	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	sendIpcEventToRendererWithWindow( parentWindow, 'theme-details-updating', { id: details.id } );
	try {
		await lockAppdata();
		userData = await loadUserData();

		userData.sites.push( server.details );
		sortSites( userData.sites );

		await saveUserData( userData );
		
		// Now handle MySQL setup AFTER the site is registered
		console.log( `[MySQL] Checking if useMySQL is true: ${ useMySQL }` );
		if ( useMySQL ) {
			console.log( `[MySQL] useMySQL is true, setting up post-creation MySQL setup` );
			// Use setTimeout to ensure this runs after the current execution context
			setTimeout( async () => {
				try {
					console.log( `[MySQL] Starting post-creation MySQL setup for site: ${ siteName || nodePath.basename( path ) }` );
					await setupMySQLSite( path, siteName || nodePath.basename( path ), server.details.id );
				} catch ( error ) {
					console.error( '[MySQL] Post-creation setup failed:', error );
					// Don't throw here as the site is already created
				}
			}, 1000 );
		} else {
			console.log( `[MySQL] useMySQL is false, skipping MySQL setup` );
		}
		
		return server.details;
	} finally {
		await unlockAppdata();
	}
}





export async function updateSite(
	event: IpcMainInvokeEvent,
	updatedSite: SiteDetails
): Promise< void > {
	try {
		await lockAppdata();
		const userData = await loadUserData();
		const updatedSites = userData.sites.map( ( site ) =>
			site.id === updatedSite.id ? updatedSite : site
		);
		userData.sites = updatedSites;

		const server = SiteServer.get( updatedSite.id );
		if ( server ) {
			await server.updateSiteDetails( updatedSite );
		}
		await saveUserData( userData );
	} finally {
		await unlockAppdata();
	}
}

type WpcomSitesToConnect = { sites: SyncSite[]; localSiteId: string }[];

export async function connectWpcomSites( event: IpcMainInvokeEvent, list: WpcomSitesToConnect ) {
	try {
		await lockAppdata();
		const userData = await loadUserData();
		const currentUserId = userData.authToken?.id;

		if ( ! currentUserId ) {
			throw new Error( 'User not authenticated' );
		}

		userData.connectedWpcomSites = userData.connectedWpcomSites || {};
		userData.connectedWpcomSites[ currentUserId ] =
			userData.connectedWpcomSites[ currentUserId ] || [];

		const connections = userData.connectedWpcomSites[ currentUserId ];

		list.forEach( ( { sites, localSiteId } ) => {
			sites.forEach( ( siteToAdd ) => {
				const isAlreadyConnected = connections.some(
					( conn ) => conn.id === siteToAdd.id && conn.localSiteId === localSiteId
				);

				// Add the site if it's not already connected
				if ( ! isAlreadyConnected ) {
					connections.push( {
						...siteToAdd,
						localSiteId,
						syncSupport: 'already-connected',
					} );
				}
			} );
		} );

		await saveUserData( userData );
	} finally {
		await unlockAppdata();
	}
}

type WpcomSitesToDisconnect = { siteIds: number[]; localSiteId: string }[];

export async function disconnectWpcomSites(
	event: IpcMainInvokeEvent,
	list: WpcomSitesToDisconnect
) {
	try {
		await lockAppdata();
		const userData = await loadUserData();
		const currentUserId = userData.authToken?.id;

		if ( ! currentUserId ) {
			throw new Error( 'User not authenticated' );
		}

		const connectedWpcomSites = userData.connectedWpcomSites;

		// Totally unreal case, added it to help TS parse the code below. And if this error happens, we definitely have something wrong.
		if ( ! Array.isArray( connectedWpcomSites?.[ currentUserId ] ) ) {
			throw new Error(
				'Something went wrong, since you are trying to disconnect something, but there are no stored connections yet'
			);
		}

		list.forEach( ( { siteIds, localSiteId } ) => {
			const updatedConnections = connectedWpcomSites[ currentUserId ].filter(
				( conn ) => ! ( siteIds.includes( conn.id ) && conn.localSiteId === localSiteId )
			);

			connectedWpcomSites[ currentUserId ] = updatedConnections;
		} );

		await saveUserData( userData );
	} finally {
		await unlockAppdata();
	}
}

export async function updateConnectedWpcomSites(
	event: IpcMainInvokeEvent,
	updatedSites: SyncSite[]
) {
	try {
		await lockAppdata();
		const userData = await loadUserData();
		const currentUserId = userData.authToken?.id;

		if ( ! currentUserId ) {
			throw new Error( 'User not authenticated' );
		}

		const connections = userData.connectedWpcomSites?.[ currentUserId ] || [];

		if ( ! connections.length ) {
			return;
		}

		updatedSites.forEach( ( updatedSite ) => {
			const index = connections.findIndex(
				( conn ) => conn.id === updatedSite.id && conn.localSiteId === updatedSite.localSiteId
			);

			if ( index !== -1 ) {
				connections[ index ] = updatedSite;
			}
		} );

		await saveUserData( userData );
	} finally {
		await unlockAppdata();
	}
}

export async function updateSingleConnectedWpcomSite(
	event: IpcMainInvokeEvent,
	updatedSite: SyncSite
) {
	try {
		await lockAppdata();
		const userData = await loadUserData();
		const currentUserId = userData.authToken?.id;

		if ( ! currentUserId ) {
			throw new Error( 'User not authenticated' );
		}

		const connections = userData.connectedWpcomSites?.[ currentUserId ] || [];
		const index = connections.findIndex(
			( conn ) => conn.id === updatedSite.id && conn.localSiteId === updatedSite.localSiteId
		);

		if ( index !== -1 ) {
			connections[ index ] = updatedSite;
		}

		await saveUserData( userData );
	} finally {
		await unlockAppdata();
	}
}

export async function getConnectedWpcomSites(
	event: IpcMainInvokeEvent,
	localSiteId?: string
): Promise< SyncSite[] > {
	const userData = await loadUserData();

	const currentUserId = userData.authToken?.id;

	if ( ! currentUserId ) {
		return [];
	}

	const allConnected = userData.connectedWpcomSites?.[ currentUserId ] || [];

	if ( localSiteId ) {
		return allConnected.filter( ( site ) => site.localSiteId === localSiteId );
	} else {
		return allConnected;
	}
}

export async function startServer(
	event: IpcMainInvokeEvent,
	id: string
): Promise< SiteDetails | null > {
	const server = SiteServer.get( id );
	if ( ! server ) {
		return null;
	}

	await keepSqliteIntegrationUpdated( server.details.path );

	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	try {
		await server.start();
	} catch ( error ) {
		/**
		 * We don't want to track WASM memory errors in Sentry
		 * because they are caused by the user's system not having enough memory
		 * and aren't a bug in Studio.
		 *
		 * When the error is thrown, we show a user-friendly message
		 * to the user, with instructions on how to provide more memory to Studio.
		 */
		if (
			error instanceof Error &&
			error.message.includes( 'Cannot allocate Wasm memory for new instance' )
		) {
			throw new Error( 'WASM_ERROR_NOT_ENOUGH_MEMORY' );
		}

		Sentry.captureException( error );
		if (
			error instanceof Error &&
			error.message.includes( '"unreachable" WASM instruction executed' )
		) {
			throw new Error( 'Please try disabling plugins and themes that might be causing the issue.' );
		}
		throw error;
	}

	sendIpcEventToRendererWithWindow( parentWindow, 'theme-details-changed', {
		id,
		details: server.details.themeDetails,
	} );

	if ( server.details.running ) {
		try {
			await server.updateCachedThumbnail();
			await sendThumbnailChangedEvent( event, id );
		} catch ( error ) {
			console.error( `Failed to update thumbnail for server ${ id }:`, error );
		}
	}

	console.log( `Server started for '${ server.details.name }'` );
	await updateSite( event, server.details );
	return server.details;
}

export async function stopServer(
	event: IpcMainInvokeEvent,
	id: string
): Promise< SiteDetails | null > {
	const server = SiteServer.get( id );
	if ( ! server ) {
		return null;
	}

	await server.stop();
	await updateSite( event, server.details );
	return server.details;
}

export interface FolderDialogResponse {
	path: string;
	name: string;
	isEmpty: boolean;
	isWordPress: boolean;
}

export async function showSaveAsDialog( event: IpcMainInvokeEvent, options: SaveDialogOptions ) {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	if ( ! parentWindow ) {
		throw new Error( `No window found for sender of showSaveAsDialog message: ${ event.frameId }` );
	}

	const defaultPath =
		options.defaultPath === nodePath.basename( options.defaultPath ?? '' )
			? nodePath.join( DEFAULT_SITE_PATH, options.defaultPath )
			: options.defaultPath;
	const { canceled, filePath } = await dialog.showSaveDialog( parentWindow, {
		defaultPath,
		...options,
	} );
	if ( canceled ) {
		return '';
	}
	return filePath;
}

export async function showOpenFolderDialog(
	event: IpcMainInvokeEvent,
	title: string,
	defaultDialogPath: string
): Promise< FolderDialogResponse | null > {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	if ( ! parentWindow ) {
		throw new Error(
			`No window found for sender of showOpenFolderDialog message: ${ event.frameId }`
		);
	}

	if ( process.env.E2E && process.env.E2E_OPEN_FOLDER_DIALOG ) {
		// Playwright's filechooser event isn't working in our e2e tests.
		// Use an environment variable to manually set which folder gets selected.
		return {
			path: process.env.E2E_OPEN_FOLDER_DIALOG,
			name: nodePath.basename( process.env.E2E_OPEN_FOLDER_DIALOG ),
			isEmpty: await isEmptyDir( process.env.E2E_OPEN_FOLDER_DIALOG ),
			isWordPress: isWordPressDirectory( process.env.E2E_OPEN_FOLDER_DIALOG ),
		};
	}

	const { canceled, filePaths } = await dialog.showOpenDialog( parentWindow, {
		title,
		defaultPath: defaultDialogPath !== '' ? defaultDialogPath : DEFAULT_SITE_PATH,
		properties: [
			'openDirectory',
			'createDirectory', // allow user to create new directories; macOS only
		],
	} );
	if ( canceled ) {
		return null;
	}

	return {
		path: filePaths[ 0 ],
		name: nodePath.basename( filePaths[ 0 ] ),
		isEmpty: await isEmptyDir( filePaths[ 0 ] ),
		isWordPress: isWordPressDirectory( filePaths[ 0 ] ),
	};
}

export async function showOpenFileDialog(
	event: IpcMainInvokeEvent,
	title: string,
	defaultDialogPath: string,
	filters?: Electron.FileFilter[]
): Promise< { path: string; name: string } | null > {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	if ( ! parentWindow ) {
		throw new Error(
			`No window found for sender of showOpenFileDialog message: ${ event.frameId }`
		);
	}

	const { canceled, filePaths } = await dialog.showOpenDialog( parentWindow, {
		title,
		defaultPath: defaultDialogPath !== '' ? defaultDialogPath : DEFAULT_SITE_PATH,
		properties: [ 'openFile' ],
		filters,
	} );
	if ( canceled ) {
		return null;
	}

	return {
		path: filePaths[ 0 ],
		name: nodePath.basename( filePaths[ 0 ] ),
	};
}

export async function saveUserLocale( event: IpcMainInvokeEvent, locale: string ) {
	await updateAppdata( { locale } );
}

export async function saveUserEditor( event: IpcMainInvokeEvent, editor: SupportedEditor ) {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	sendIpcEventToRendererWithWindow( parentWindow, 'user-preference-changed' );

	await updateAppdata( { preferredEditor: editor } );
}

export async function getSentryUserId( _event: IpcMainInvokeEvent ): Promise< string | undefined > {
	const userData = await loadUserData();
	return userData.sentryUserId;
}

export async function getUserLocale( _event: IpcMainInvokeEvent ): Promise< SupportedLocale > {
	return getUserLocaleWithFallback();
}

export async function getUserEditor(
	_event: IpcMainInvokeEvent
): Promise< SupportedEditor | null > {
	const userData = await loadUserData();
	return userData.preferredEditor ?? null;
}

export function showUserSettings( event: IpcMainInvokeEvent, tabName?: UserSettingsTabName ) {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	sendIpcEventToRendererWithWindow( parentWindow, 'user-settings', { tabName } );
}

function archiveWordPressDirectory( {
	source,
	archivePath,
	format,
}: {
	source: string;
	archivePath: string;
	format: 'zip' | 'tar';
} ) {
	return new Promise( ( resolve, reject ) => {
		const output = fs.createWriteStream( archivePath );
		const archive = archiver( format, ARCHIVER_OPTIONS[ format ] );

		output.on( 'close', function () {
			resolve( archive );
		} );

		archive.on( 'error', function ( err: Error ) {
			reject( err );
		} );

		archive.pipe( output );
		// Archive site wp-content
		archive.directory( `${ source }/wp-content`, 'wp-content' );
		archive.file( `${ source }/wp-config.php`, { name: 'wp-config.php' } );

		archive.finalize().catch( reject );
	} );
}

export async function archiveSite( event: IpcMainInvokeEvent, id: string, format: 'zip' | 'tar' ) {
	const site = SiteServer.get( id );
	if ( ! site ) {
		throw new Error( 'Site not found.' );
	}
	const sitePath = site.details.path;
	const archivePath = `${ TEMP_DIR }site_${ id }.${ format }`;
	await archiveWordPressDirectory( {
		source: sitePath,
		archivePath,
		format,
	} );
	const stats = fs.statSync( archivePath );
	return { archivePath, archiveSizeInBytes: stats.size };
}

export async function exportSiteToPush( event: IpcMainInvokeEvent, id: string ) {
	const site = SiteServer.get( id );
	if ( ! site ) {
		throw new Error( 'Site not found.' );
	}
	const extension = 'tar.gz';
	const archivePath = `${ TEMP_DIR }site_${ id }.${ extension }`;
	const exportOptions: ExportOptions = {
		site: site.details,
		backupFile: archivePath,
		includes: {
			database: true,
			uploads: true,
			plugins: true,
			themes: true,
			muPlugins: true,
			fonts: true,
		},
		phpVersion: site.details.phpVersion,
		splitDatabaseDumpByTable: true,
	};
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	const onEvent = () => {};
	await exportBackup( exportOptions, onEvent );
	const stats = fs.statSync( archivePath );
	const archiveContent = fs.readFileSync( archivePath );
	return { archivePath, archiveContent, archiveSizeInBytes: stats.size };
}

export function removeTemporalFile( event: IpcMainInvokeEvent, path: string ) {
	if ( ! path.includes( TEMP_DIR ) ) {
		throw new Error( 'The given path is not a temporal file' );
	}
	try {
		fs.unlinkSync( path );
	} catch ( error ) {
		if ( isErrnoException( error ) && error.code === 'ENOENT' ) {
			// Silently ignore if the temporal file doesn't exist
			Sentry.captureException( error );
		}
	}
}

export async function deleteSite( event: IpcMainInvokeEvent, id: string, deleteFiles = false ) {
	try {
		await lockAppdata();
		const userData = await loadUserData();
		const server = SiteServer.get( id );
		console.log( 'Deleting site', id );
		if ( ! server ) {
			throw new Error( 'Site not found.' );
		}
		
		// Check if this is a MySQL site and drop the database
		try {
			await dropMySQLDatabaseIfExists( server.details.path );
		} catch ( error ) {
			console.error( '[MySQL] Failed to drop MySQL database:', error );
			// Don't fail the deletion if database drop fails
		}
		
		await server.delete();
		try {
			// Move files to trash
			if ( deleteFiles ) {
				await shell.trashItem( server.details.path );
			}
		} catch ( error ) {
			/* We want to exit gracefully if the there is an error deleting the site files */
			Sentry.captureException( error );
		}
		const newSites = userData.sites.filter( ( site ) => site.id !== id );
		await saveUserData( { ...userData, sites: newSites } );
	} finally {
		await unlockAppdata();
	}
}

export function logRendererMessage(
	event: IpcMainInvokeEvent,
	level: LogLevel,
	...args: unknown[]
): void {
	// 4 characters long so it aligns with the main process logs
	const processId = `ren${ event.sender.id }`;
	writeLogToFile( level, processId, ...args );
}

export async function authenticate( event: IpcMainInvokeEvent, isSignup = false ) {
	const locale = await getUserLocaleWithFallback();
	const authUrl = isSignup ? getSignUpUrl( locale ) : getAuthenticationUrl( locale );
	void shellOpenExternalWrapper( authUrl );
}

export async function getAuthenticationToken() {
	return oauthClient.getAuthenticationToken();
}

export async function isAuthenticated() {
	return oauthClient.isAuthenticated();
}

export async function clearAuthenticationToken() {
	return await updateAppdata( { authToken: undefined } );
}

export async function exportSite(
	event: IpcMainInvokeEvent,
	options: ExportOptions,
	siteId: string
): Promise< boolean > {
	try {
		const onEvent = ( data: ImportExportEventData ) => {
			const parentWindow = BrowserWindow.fromWebContents( event.sender );
			sendIpcEventToRendererWithWindow( parentWindow, 'on-export', data, siteId );
		};

		const result = await exportBackup( options, onEvent );

		if ( result ) {
			const isDatabaseOnly =
				options.includes.database &&
				! options.includes.uploads &&
				! options.includes.plugins &&
				! options.includes.themes &&
				! options.includes.muPlugins;
			bumpStat(
				StatsGroup.STUDIO_EXPORT,
				isDatabaseOnly ? StatsMetric.DATABASE_ONLY : StatsMetric.FULL_SITE
			);
		} else {
			bumpStat( StatsGroup.STUDIO_EXPORT, StatsMetric.FAILURE );
		}

		return result;
	} catch ( e ) {
		bumpStat( StatsGroup.STUDIO_EXPORT, StatsMetric.FAILURE );
		Sentry.captureException( e );
		throw e;
	}
}

export async function saveSnapshotsToStorage( event: IpcMainInvokeEvent, snapshots: Snapshot[] ) {
	try {
		await lockAppdata();
		const userData = await loadUserData();
		userData.snapshots = snapshots;
		await saveUserData( userData );
	} finally {
		await unlockAppdata();
	}
}

export async function saveLastSeenVersion( event: IpcMainInvokeEvent, version: string ) {
	await updateAppdata( { lastSeenVersion: version } );
}

export async function getSnapshots( _event: IpcMainInvokeEvent ): Promise< Snapshot[] > {
	const userData = await loadUserData();
	const { snapshots = [] } = userData;
	return snapshots;
}

export async function getLastSeenVersion(
	_event: IpcMainInvokeEvent
): Promise< string | undefined > {
	// If we're running in E2E mode, return the app version
	if ( process.env.E2E ) {
		return app.getVersion();
	}
	const userData = await loadUserData();
	return userData.lastSeenVersion;
}

export async function openSiteURL(
	event: IpcMainInvokeEvent,
	id: string,
	relativeURL = '',
	{ autoLogin = true }: { autoLogin?: boolean } = {}
) {
	const site = SiteServer.get( id );
	if ( ! site?.server?.url ) {
		await showMessageBox( event, {
			type: 'error',
			message: __( 'Failed to open link' ),
			detail: __( 'Please ensure your site files have not been moved or deleted.' ),
		} );
		return;
	}

	const url = new URL( relativeURL, site.server.url );
	if ( autoLogin ) {
		url.searchParams.append( 'playground-auto-login', 'true' );
	}

	void shellOpenExternalWrapper( url.toString() );
}

export function openURL( event: IpcMainInvokeEvent, url: string ) {
	void shellOpenExternalWrapper( url );
}

export function copyText( event: IpcMainInvokeEvent, text: string ) {
	return clipboard.writeText( text );
}

export function getAppGlobals(): AppGlobals {
	return {
		platform: process.platform,
		appName: app.name,
		appVersion: app.getVersion(),
		arm64Translation: app.runningUnderARM64Translation,
		selectiveSyncEnabled: process.env.STUDIO_SELECTIVE_SYNC === 'true',
	};
}

export function getWpVersion( _event: IpcMainInvokeEvent, id: string ) {
	const server = SiteServer.get( id );
	if ( ! server ) {
		return '-';
	}
	const wordPressPath = server.details.path;
	let versionFileContent = '';
	try {
		versionFileContent = fs.readFileSync(
			nodePath.join( wordPressPath, 'wp-includes', 'version.php' ),
			'utf8'
		);
	} catch ( err ) {
		return '-';
	}
	const matches = versionFileContent.match( /\$wp_version\s*=\s*'([0-9a-zA-Z.-]+)'/ );
	return matches?.[ 1 ] || '-';
}

export async function generateProposedSitePath(
	_event: IpcMainInvokeEvent,
	siteName: string
): Promise< FolderDialogResponse > {
	const path = nodePath.join( DEFAULT_SITE_PATH, sanitizeFolderName( siteName ) );

	try {
		return {
			path,
			name: siteName,
			isEmpty: await isEmptyDir( path ),
			isWordPress: isWordPressDirectory( path ),
		};
	} catch ( err ) {
		if ( isErrnoException( err ) && err.code === 'ENOENT' ) {
			return {
				path,
				name: siteName,
				isEmpty: true,
				isWordPress: false,
			};
		}
		throw err;
	}
}

export async function openLocalPath( _event: IpcMainInvokeEvent, path: string ) {
	await shell.openPath( path );
}

export function showItemInFolder( _event: IpcMainInvokeEvent, path: string ) {
	shell.showItemInFolder( path );
}

export async function getThemeDetails(
	event: IpcMainInvokeEvent,
	id: string
): Promise< StartedSiteDetails[ 'themeDetails' ] > {
	const server = SiteServer.get( id );
	if ( ! server ) {
		throw new Error( 'Site not found.' );
	}

	if ( ! server.details.running || ! server.server ) {
		return undefined;
	}
	const themeDetails = await phpGetThemeDetails( server.server );

	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	if ( themeDetails?.path && themeDetails.path !== server.details.themeDetails?.path ) {
		sendIpcEventToRendererWithWindow( parentWindow, 'theme-details-updating', { id } );
		const updatedSite = {
			...server.details,
			themeDetails,
		};
		sendIpcEventToRendererWithWindow( parentWindow, 'theme-details-changed', {
			id,
			details: themeDetails,
		} );

		void server.updateCachedThumbnail().then( () => sendThumbnailChangedEvent( event, id ) );
		server.details.themeDetails = themeDetails;
		await updateSite( event, updatedSite );
	}
	return themeDetails;
}

export async function getOnboardingData( _event: IpcMainInvokeEvent ): Promise< boolean > {
	const userData = await loadUserData();
	const { onboardingCompleted = false } = userData;
	return onboardingCompleted;
}

export async function saveOnboarding( event: IpcMainInvokeEvent, onboardingCompleted: boolean ) {
	await updateAppdata( { onboardingCompleted } );
}

export async function executeWPCLiInline(
	_event: IpcMainInvokeEvent,
	{
		siteId,
		args,
		skipPluginsAndThemes = false,
	}: {
		siteId: string;
		args: string;
		skipPluginsAndThemes?: boolean;
	}
): Promise< WpCliResult > {
	if ( SiteServer.isDeleted( siteId ) ) {
		return {
			stdout: '',
			stderr: `Cannot execute command on deleted site ${ siteId }`,
			exitCode: 1,
		};
	}
	const server = SiteServer.get( siteId );
	if ( ! server ) {
		throw new Error( 'Site not found.' );
	}
	return server.executeWpCliCommand( args, {
		skipPluginsAndThemes,
	} );
}

export function getThumbnailData( _event: IpcMainInvokeEvent, id: string ) {
	const path = getSiteThumbnailPath( id );
	return getImageData( path );
}

function promiseExec( command: string, options: ExecOptions = {} ): Promise< void > {
	return new Promise( ( resolve, reject ) => {
		exec( command, options, ( error ) => {
			if ( error ) {
				reject( error );
				return;
			}
			resolve();
		} );
	} );
}

export async function openTerminalAtPath( _event: IpcMainInvokeEvent, targetPath: string ) {
	const platform = process.platform;

	const preferredTerminal = await getUserTerminal();

	if ( platform === 'darwin' ) {
		const escapedPath = targetPath.replace( /\\/g, '\\\\' ).replace( /"/g, '\\"' );
		const bundleIds = {
			warp: 'dev.warp.Warp-Stable',
			ghostty: 'com.mitchellh.ghostty',
			iterm: 'com.googlecode.iterm2',
			terminal: 'com.apple.Terminal',
		};
		return promiseExec( `open -b ${ bundleIds[ preferredTerminal ] } "${ escapedPath }"` );
	} else if ( platform === 'win32' ) {
		const userData = await loadUserData();
		const preferredTerminal = userData.preferredTerminal;
		const defaultShell = process.env.ComSpec || 'cmd.exe';

		if ( preferredTerminal === 'warp' ) {
			const encodedPath = encodeURIComponent( targetPath );
			return promiseExec( `start "" "warp://action/new_tab?path=${ encodedPath }"` );
		}

		return promiseExec( `start "Command Prompt" ${ defaultShell }`, {
			cwd: targetPath,
		} );
	} else if ( platform === 'linux' ) {
		return promiseExec( `gnome-terminal --working-directory=${ targetPath }` );
	} else {
		console.error( 'Unsupported platform:', platform );
		return;
	}
}

export async function openAppAtPath(
	event: IpcMainInvokeEvent,
	editorKey: SupportedEditor,
	filePath: string
): Promise< void > {
	const platform = process.platform;
	const editor = supportedEditorConfig[ editorKey ];

	if ( platform === 'darwin' ) {
		return promiseExec( `open -b ${ editor.macOSBundleId } "${ filePath }"` );
	}

	if ( platform === 'win32' ) {
		const editorPath = await winFindEditorPath( editorKey );
		if ( ! editorPath ) {
			// Fall back to using openURL if no editor path is found
			return openURL( event, editor.url( filePath ) );
		}

		return promiseExec( `"${ editorPath }" "${ filePath }"` );
	}

	throw new Error( `Platform ${ platform } is not supported` );
}

export function showMessageBox( event: IpcMainInvokeEvent, options: Electron.MessageBoxOptions ) {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	if ( parentWindow && ! parentWindow.isDestroyed() && ! event.sender.isDestroyed() ) {
		return dialog.showMessageBox( parentWindow, options );
	}
	return dialog.showMessageBox( options );
}

export async function showErrorMessageBox(
	event: IpcMainInvokeEvent,
	{
		title,
		message,
		error,
		showOpenLogs = false,
	}: { title: string; message: string; error?: unknown; showOpenLogs?: boolean }
) {
	// Remove prepended error message added by IPC handler
	const filteredError = ( error as Error )?.message?.replace(
		/Error invoking remote method '\w+': Error:/g,
		''
	);
	const response = await showMessageBox( event, {
		type: 'error',
		message: title,
		detail: error ? `${ message }\n\n${ filteredError }` : message,
		buttons: [ ...( showOpenLogs ? [ __( 'Open Studio Logs' ) ] : [] ), __( 'OK' ) ],
	} );

	if ( showOpenLogs && response.response === 0 ) {
		const logFilePath = getLogsFilePath();
		const err = await shell.openPath( logFilePath );
		if ( err ) {
			console.error( `Error opening logs file: ${ logFilePath } ${ err }` );
		}
	}
}

export function showNotification(
	_event: IpcMainInvokeEvent,
	options: Electron.NotificationConstructorOptions
) {
	new Notification( options ).show();
}

export async function setupAppMenu(
	_event: IpcMainInvokeEvent,
	config: { needsOnboarding: boolean }
) {
	await setupMenu( config );
}

export async function popupAppMenu( _event: IpcMainInvokeEvent ) {
	await popupMenu();
}

export async function promptWindowsSpeedUpSites(
	_event: IpcMainInvokeEvent,
	{ skipIfAlreadyPrompted }: { skipIfAlreadyPrompted: boolean }
) {
	await windowsHelpers.promptWindowsSpeedUpSites( { skipIfAlreadyPrompted } );
}

export function setDefaultLocaleData( _event: IpcMainInvokeEvent, locale?: LocaleData ) {
	defaultI18n.setLocaleData( locale );
}

export function resetDefaultLocaleData( _event: IpcMainInvokeEvent ) {
	defaultI18n.resetLocaleData();
}

export function toggleMinWindowWidth( event: IpcMainInvokeEvent, isSidebarVisible: boolean ) {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	if ( ! parentWindow || parentWindow.isDestroyed() || event.sender.isDestroyed() ) {
		return;
	}
	const [ currentWidth, currentHeight ] = parentWindow.getSize();
	const newWidth = Math.max(
		MAIN_MIN_WIDTH,
		isSidebarVisible ? currentWidth - SIDEBAR_WIDTH : currentWidth + SIDEBAR_WIDTH
	);
	parentWindow.setSize( newWidth, currentHeight, true );
}

/**
 * Returns the absolute path of a file in the site's directory.
 * Returns null if the file does not exist.
 */
export async function getAbsolutePathFromSite(
	_event: IpcMainInvokeEvent,
	siteId: string,
	relativePath: string
): Promise< string | null > {
	const server = SiteServer.get( siteId );
	if ( ! server ) {
		throw new Error( 'Site not found.' );
	}

	const path = nodePath.join( server.details.path, relativePath );
	return ( await pathExists( path ) ) ? path : null;
}

/**
 * Opens a file in the IDE with the site context.
 */
export async function openFileInIDE(
	_event: IpcMainInvokeEvent,
	relativePath: string,
	siteId: string
) {
	const server = SiteServer.get( siteId );
	if ( ! server ) {
		throw new Error( 'Site not found.' );
	}

	const path = await getAbsolutePathFromSite( _event, siteId, relativePath );
	if ( ! path ) {
		return;
	}

	if ( isInstalled( 'vscode' ) ) {
		// Open site first to ensure the file is opened within the site context
		await shellOpenExternalWrapper( `vscode://file/${ server.details.path }?windowId=_blank` );
		await shellOpenExternalWrapper( `vscode://file/${ path }` );
	} else if ( isInstalled( 'phpstorm' ) ) {
		// Open site first to ensure the file is opened within the site context
		await shellOpenExternalWrapper( `phpstorm://open?file=${ path }` );
	}
}

export async function downloadSyncBackup(
	event: Electron.IpcMainInvokeEvent,
	remoteSiteId: number,
	downloadUrl: string
) {
	const tmpDir = nodePath.join( app.getPath( 'temp' ), 'wp-studio-backups' );
	await fsPromises.mkdir( tmpDir, { recursive: true } );

	const filePath = getSyncBackupTempPath( remoteSiteId );
	await download( downloadUrl, filePath );
	return filePath;
}

export async function removeSyncBackup( event: IpcMainInvokeEvent, remoteSiteId: number ) {
	const filePath = getSyncBackupTempPath( remoteSiteId );
	await fsPromises.unlink( filePath );
}

export async function isImportExportSupported( _event: IpcMainInvokeEvent, siteId: string ) {
	const site = SiteServer.get( siteId );
	if ( ! site ) {
		throw new Error( 'Site not found.' );
	}
	return site.hasSQLitePlugin();
}

/**
 * Store the ID of a push/pull operation in a deduped set.
 */
export function addSyncOperation( event: IpcMainInvokeEvent, id: string ) {
	ACTIVE_SYNC_OPERATIONS.add( id );
}

/**
 * Clear the ID of a push/pull operation.
 */
export function clearSyncOperation( event: IpcMainInvokeEvent, id: string ) {
	ACTIVE_SYNC_OPERATIONS.delete( id );
}

export function getWpContentSize( _event: IpcMainInvokeEvent, siteId: string ) {
	const site = SiteServer.get( siteId );
	if ( ! site ) {
		throw new Error( 'Site not found.' );
	}
	return calculateDirectorySize( nodePath.join( site.details.path, 'wp-content' ) );
}

export function openCertificate( _event: IpcMainInvokeEvent ) {
	return openCertificateDialog();
}

export async function isCATrusted(): Promise< boolean > {
	return isRootCATrusted();
}

export async function trustCertificate( event: IpcMainInvokeEvent ): Promise< void > {
	const platform = process.platform;
	if ( platform === 'win32' ) {
		try {
			await trustRootCA();
		} catch ( error ) {
			await showErrorMessageBox( event, {
				title: __( 'Certificate Trust Failed' ),
				message: __(
					'Studio was unable to trust the certificate automatically. You may need to trust it manually using certificate manager.'
				),
				showOpenLogs: true,
			} );
		}
	} else {
		await openCertificateDialog();
	}
}

export async function getFileContent( event: IpcMainInvokeEvent, filePath: string ) {
	if ( ! fs.existsSync( filePath ) ) {
		throw new Error( `File not found: ${ filePath }` );
	}

	try {
		// Read file as UTF-8 with BOM handling
		const content = fs.readFileSync( filePath, 'utf8' );
		// Remove BOM if present
		return content.replace( /^\uFEFF/, '' );
	} catch ( error ) {
		// Fallback: read as buffer and try different encodings
		const buffer = fs.readFileSync( filePath );

		// Try different encodings
		const encodings = [ 'utf8', 'utf16le', 'latin1', 'ascii' ];

		for ( const encoding of encodings ) {
			try {
				const content = buffer.toString( encoding as BufferEncoding );
				// Remove BOM if present
				return content.replace( /^\uFEFF/, '' );
			} catch {
				continue;
			}
		}

		throw new Error( `Unable to read file with any supported encoding: ${ filePath }` );
	}
}

/**
 * Checks the size of a sync backup file before downloading.
 * Returns the size in bytes.
 */
export async function checkSyncBackupSize(
	event: IpcMainInvokeEvent,
	downloadUrl: string
): Promise< number > {
	return new Promise( ( resolve, reject ) => {
		https
			.get( downloadUrl, { method: 'HEAD' }, ( res ) => {
				if ( res.statusCode !== 200 ) {
					reject( new Error( `Failed to fetch file size: ${ res.statusMessage }` ) );
					return;
				}

				const contentLength = res.headers[ 'content-length' ];
				if ( ! contentLength ) {
					reject( new Error( 'Content-Length header not found' ) );
					return;
				}

				resolve( parseInt( contentLength, 10 ) );
			} )
			.on( 'error', ( error: Error ) => {
				Sentry.captureException( error );
				reject( new Error( `Failed to check backup file size: ${ error.message }` ) );
			} );
	} );
}

export async function saveUserTerminal(
	event: IpcMainInvokeEvent,
	preferredTerminal: SupportedTerminal
) {
	await sendIpcEventToRenderer( 'user-preference-changed' );
	await updateAppdata( { preferredTerminal } );
}

export async function getUserTerminal(): Promise< SupportedTerminal > {
	const userData = await loadUserData();
	return userData.preferredTerminal || DEFAULT_TERMINAL;
}

export async function isFullscreen( _event: IpcMainInvokeEvent ): Promise< boolean > {
	const window = await getMainWindow();
	return window.isFullScreen();
}

export async function getAllCustomDomains(): Promise< string[] > {
	const userData = await loadUserData();

	return userData.sites
		.map( ( site ) => site.customDomain )
		.filter( ( domain ): domain is string => domain !== undefined );
}

export async function createSnapshot(
	event: IpcMainInvokeEvent,
	siteFolder: string
): Promise< { operationId: crypto.UUID } > {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	return executePreviewCliCommand( [ 'preview', 'create', '--path', siteFolder ], parentWindow );
}

export async function updateSnapshot(
	event: IpcMainInvokeEvent,
	siteFolder: string,
	hostname: string
): Promise< { operationId: crypto.UUID } > {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	return executePreviewCliCommand(
		[ 'preview', 'update', '--path', siteFolder, hostname ],
		parentWindow
	);
}

export async function deleteSnapshot(
	event: IpcMainInvokeEvent,
	hostname: string
): Promise< { operationId: crypto.UUID } > {
	const parentWindow = BrowserWindow.fromWebContents( event.sender );
	return executePreviewCliCommand( [ 'preview', 'delete', hostname ], parentWindow );
}

export async function handleNewSite( event: IpcMainInvokeEvent, newSite: NewSiteDetails ) {
	try {
		await createSite( event, newSite.path, undefined, undefined, undefined, undefined, newSite.id );
		await lockAppdata();
		const userData = await loadUserData();
		const newSites = userData.newSites?.filter( ( s ) => s.id !== newSite.id );
		await saveUserData( { ...userData, newSites } );
	} finally {
		await unlockAppdata();
	}
}

export function comparePaths( event: IpcMainInvokeEvent, path1: string, path2: string ) {
	return arePathsEqual( path1, path2 );
}

export async function listWpContentFolders(
	_event: Electron.IpcMainInvokeEvent,
	siteId: string,
	subdir: 'plugins' | 'themes'
): Promise< { name: string; type: 'file' | 'folder' }[] > {
	const server = SiteServer.get( siteId );
	if ( ! server ) throw new Error( 'Site not found' );
	const wpContentPath = nodePath.join( server.details.path, 'wp-content', subdir );

	try {
		const entries = await fs.promises.readdir( wpContentPath, { withFileTypes: true } );
		return entries
			.map( ( e ) => ( {
				name: e.name.toString(),
				type: e.isDirectory() ? ( 'folder' as const ) : ( 'file' as const ),
			} ) )
			.filter( ( entry: { name: string; type: string } ) => {
				if ( entry.type === 'folder' ) return true;
				return entry.type === 'file' && entry.name.toLowerCase().endsWith( '.php' );
			} );
	} catch ( err ) {
		return [];
	}
}

export async function installPluginFromPrivateRepo(
	_event: IpcMainInvokeEvent,
	{
		siteId,
		repositoryUrl,
		githubToken,
		pluginName,
	}: {
		siteId: string;
		repositoryUrl: string;
		githubToken: string;
		pluginName: string;
	}
): Promise< { success: boolean; error?: string } > {
	console.log( `[Wizard Hat] Starting installation of ${ pluginName } from ${ repositoryUrl }` );

	const server = SiteServer.get( siteId );
	if ( ! server ) {
		console.error( `[Wizard Hat] Site not found: ${ siteId }` );
		throw new Error( 'Site not found.' );
	}

	const tempDir = nodePath.join( os.tmpdir(), `wizard-hat-plugin-${ Date.now() }` );
	const zipPath = `${ tempDir }.zip`;

	console.log( `[Wizard Hat] Using temp directory: ${ tempDir }` );
	console.log( `[Wizard Hat] ZIP file will be: ${ zipPath }` );

	try {
		// --- NEW LOGIC: Handle all-plugins repo using GitHub API ---
		const allPluginsMatch = repositoryUrl.match(
			/^https:\/\/github\.com\/woocommerce\/all-plugins(?:\.git)?(?:\/)?(?:#.*)?$/i
		);
		let isAllPlugins = false;
		let zipDownloadUrl = '';

		if ( allPluginsMatch || repositoryUrl.includes( 'woocommerce/all-plugins' ) ) {
			isAllPlugins = true;
			console.log(
				`[Wizard Hat] Detected all-plugins repo, using GitHub API to find download URL`
			);

			// Use GitHub API to traverse the repository and find the correct download URL
			const pluginSlug = pluginName;

			try {
				// 1. Get the latest commit SHA for all-plugins
				const commitsResponse = await fetch(
					'https://api.github.com/repos/woocommerce/all-plugins/commits',
					{
						headers: {
							Authorization: `token ${ githubToken }`,
							Accept: 'application/vnd.github.v3+json',
							'User-Agent': 'Wizard Hat Toolkit',
						},
					}
				);

				if ( ! commitsResponse.ok ) {
					throw new Error(
						`Failed to fetch commits: ${ commitsResponse.status } ${ commitsResponse.statusText }`
					);
				}

				const commits = await commitsResponse.json();
				const treeSha = commits[ 0 ].commit.tree.sha;
				console.log( `[Wizard Hat] Latest commit SHA: ${ treeSha }` );

				// 2. Get the tree for the latest commit
				const treeResponse = await fetch(
					`https://api.github.com/repos/woocommerce/all-plugins/git/trees/${ treeSha }`,
					{
						headers: {
							Authorization: `token ${ githubToken }`,
							Accept: 'application/vnd.github.v3+json',
							'User-Agent': 'Wizard Hat Toolkit',
						},
					}
				);

				if ( ! treeResponse.ok ) {
					throw new Error(
						`Failed to fetch tree: ${ treeResponse.status } ${ treeResponse.statusText }`
					);
				}

				const tree = await treeResponse.json();

				// 3. Find the product-packages directory SHA
				const productPackages = tree.tree.find( ( item: any ) => item.path === 'product-packages' );
				if ( ! productPackages ) {
					throw new Error( 'product-packages directory not found in repository' );
				}
				console.log( `[Wizard Hat] Found product-packages directory` );

				// 4. Get the tree for product-packages
				const packagesTreeResponse = await fetch(
					`https://api.github.com/repos/woocommerce/all-plugins/git/trees/${ productPackages.sha }`,
					{
						headers: {
							Authorization: `token ${ githubToken }`,
							Accept: 'application/vnd.github.v3+json',
							'User-Agent': 'Wizard Hat Toolkit',
						},
					}
				);

				if ( ! packagesTreeResponse.ok ) {
					throw new Error(
						`Failed to fetch packages tree: ${ packagesTreeResponse.status } ${ packagesTreeResponse.statusText }`
					);
				}

				const packagesTree = await packagesTreeResponse.json();

				// 5. Find the plugin directory
				const pluginDir = packagesTree.tree.find( ( item: any ) => item.path === pluginSlug );
				if ( ! pluginDir ) {
					throw new Error( `Plugin '${ pluginSlug }' not found in product-packages directory` );
				}
				console.log( `[Wizard Hat] Found plugin directory: ${ pluginSlug }` );

				// 6. Get the contents of the plugin directory
				const contentsResponse = await fetch(
					`https://api.github.com/repos/woocommerce/all-plugins/contents/product-packages/${ pluginSlug }`,
					{
						headers: {
							Authorization: `token ${ githubToken }`,
							Accept: 'application/vnd.github.v3+json',
							'User-Agent': 'Wizard Hat Toolkit',
						},
					}
				);

				if ( ! contentsResponse.ok ) {
					throw new Error(
						`Failed to fetch contents: ${ contentsResponse.status } ${ contentsResponse.statusText }`
					);
				}

				const contents = await contentsResponse.json();

				// 7. Find the zip file
				const zipFile = contents.find( ( file: any ) => file.name === `${ pluginSlug }.zip` );
				if ( ! zipFile ) {
					throw new Error( `Zip file '${ pluginSlug }.zip' not found for plugin` );
				}

				zipDownloadUrl = zipFile.download_url;
				console.log( `[Wizard Hat] Found download URL: ${ zipDownloadUrl }` );
				console.log( `[Wizard Hat] Zip file details:`, {
					name: zipFile.name,
					size: zipFile.size,
					download_url: zipDownloadUrl,
					path: zipFile.path,
				} );

				// Test the download URL with a HEAD request
				try {
					const headResponse = await fetch( zipDownloadUrl, {
						method: 'HEAD',
						headers: {
							Authorization: `token ${ githubToken }`,
							'User-Agent': 'Wizard Hat Toolkit',
						},
					} );

					console.log( `[Wizard Hat] HEAD request result:`, {
						status: headResponse.status,
						statusText: headResponse.statusText,
						contentLength: headResponse.headers.get( 'content-length' ),
						contentType: headResponse.headers.get( 'content-type' ),
					} );

					if ( ! headResponse.ok ) {
						throw new Error(
							`HEAD request failed: ${ headResponse.status } ${ headResponse.statusText }`
						);
					}
				} catch ( headError ) {
					console.warn( `[Wizard Hat] HEAD request failed:`, headError );
				}
			} catch ( apiError ) {
				console.error( `[Wizard Hat] GitHub API error:`, apiError );
				throw new Error(
					`Failed to find plugin download URL: ${
						apiError instanceof Error ? apiError.message : String( apiError )
					}`
				);
			}
		}

		if ( isAllPlugins && zipDownloadUrl ) {
			// Download the ZIP file directly with authentication
			const { download } = await import( 'src/lib/download' );
			const headers = githubToken
				? {
						Authorization: `token ${ githubToken }`,
						'User-Agent': 'Wizard Hat Toolkit',
				  }
				: undefined;

			console.log( `[Wizard Hat] Downloading ZIP from: ${ zipDownloadUrl }` );
			console.log(
				`[Wizard Hat] Download headers:`,
				headers ? { ...headers, Authorization: '***' } : 'None'
			);
			console.log( `[Wizard Hat] Target ZIP path: ${ zipPath }` );

			try {
				await download( zipDownloadUrl, zipPath, false, pluginName, headers );
				console.log( `[Wizard Hat] Download completed successfully` );

				// Verify the downloaded file
				const downloadStats = await fsPromises.stat( zipPath );
				console.log( `[Wizard Hat] Downloaded file size: ${ downloadStats.size } bytes` );

				if ( downloadStats.size === 0 ) {
					throw new Error( 'Downloaded file is empty (0 bytes)' );
				}

				// Check if it's actually a zip file
				const fileBuffer = await fsPromises.readFile( zipPath );
				const isZipFile = fileBuffer.slice( 0, 4 ).toString( 'hex' ) === '504b0304';
				console.log( `[Wizard Hat] File is valid ZIP: ${ isZipFile }` );

				if ( ! isZipFile ) {
					// Read the first few bytes to see what we actually got
					const fileContent = fileBuffer.slice( 0, 200 ).toString( 'utf8' );
					console.log( `[Wizard Hat] File content preview:`, fileContent );
					throw new Error( 'Downloaded file is not a valid ZIP file' );
				}
			} catch ( downloadError ) {
				console.error( `[Wizard Hat] Download failed:`, downloadError );
				throw new Error(
					`Failed to download plugin: ${
						downloadError instanceof Error ? downloadError.message : String( downloadError )
					}`
				);
			}
		} else {
			// --- EXISTING LOGIC: Clone the repository ---
			const authUrl = repositoryUrl.replace( 'https://', `https://${ githubToken }@` );
			console.log( `[Wizard Hat] Created authenticated URL (token masked)` );
			console.log( `[Wizard Hat] Cloning repository...` );
			await promiseExec( `git clone ${ authUrl } ${ tempDir }` );
			console.log( `[Wizard Hat] Repository cloned successfully` );

			// Check if the directory was created and has content
			const tempDirExists = await fsPromises
				.access( tempDir )
				.then( () => true )
				.catch( () => false );
			if ( ! tempDirExists ) {
				throw new Error( 'Failed to create temporary directory' );
			}
			const tempDirContents = await fsPromises.readdir( tempDir );
			console.log( `[Wizard Hat] Temp directory contents:`, tempDirContents );

			// Create ZIP file (excluding .git directory)
			console.log( `[Wizard Hat] Creating ZIP file...` );
			await promiseExec( `cd ${ tempDir } && zip -r ${ zipPath } . -x "*.git*"` );
			console.log( `[Wizard Hat] ZIP file created successfully` );
		}

		// Check if ZIP file was created
		const zipExists = await fsPromises
			.access( zipPath )
			.then( () => true )
			.catch( () => false );
		if ( ! zipExists ) {
			throw new Error( 'Failed to create ZIP file' );
		}

		const zipStats = await fsPromises.stat( zipPath );
		console.log( `[Wizard Hat] ZIP file size: ${ zipStats.size } bytes` );

		// Debug: Inspect ZIP file contents
		try {
			console.log( `[Wizard Hat] Inspecting ZIP file contents...` );
			const { exec } = await import( 'child_process' );
			const { promisify } = await import( 'util' );
			const execAsync = promisify( exec );

			// List contents of the ZIP file
			const { stdout: zipContents } = await execAsync( `unzip -l "${ zipPath }"` );
			console.log( `[Wizard Hat] ZIP file contents:\n${ zipContents }` );

			// Check if the ZIP contains the expected plugin structure
			const hasPluginFile = zipContents.includes( `${ pluginName }.php` );
			const hasReadmeFile = zipContents.includes( 'readme.txt' );
			console.log( `[Wizard Hat] ZIP contains ${ pluginName }.php: ${ hasPluginFile }` );
			console.log( `[Wizard Hat] ZIP contains readme.txt: ${ hasReadmeFile }` );

			if ( ! hasPluginFile ) {
				console.warn(
					`[Wizard Hat] Warning: ZIP file does not contain expected plugin file ${ pluginName }.php`
				);

				// Check if the plugin files are in a subdirectory
				const lines = zipContents.split( '\n' );
				const pluginFileInSubdir = lines.find( ( line ) => line.includes( `${ pluginName }.php` ) );

				if ( pluginFileInSubdir ) {
					console.log( `[Wizard Hat] Found plugin file in subdirectory: ${ pluginFileInSubdir }` );

					// Extract and repackage the zip file
					console.log( `[Wizard Hat] Extracting and repackaging ZIP file...` );

					// Create a temporary extraction directory
					const extractDir = `${ tempDir }-extract`;
					await fsPromises.mkdir( extractDir, { recursive: true } );

					// Extract the zip file
					await execAsync( `unzip -q "${ zipPath }" -d "${ extractDir }"` );

					// List the extracted contents
					const extractedContents = await fsPromises.readdir( extractDir );
					console.log( `[Wizard Hat] Extracted contents:`, extractedContents );

					// Find the plugin directory (should be the only directory)
					const pluginDir = extractedContents.find( ( item ) => {
						try {
							return fs.statSync( nodePath.join( extractDir, item ) ).isDirectory();
						} catch {
							return false;
						}
					} );

					if ( pluginDir ) {
						console.log( `[Wizard Hat] Found plugin directory: ${ pluginDir }` );

						// Create a new zip file with the plugin files at the root
						const newZipPath = `${ tempDir }-fixed.zip`;
						await execAsync(
							`cd "${ nodePath.join( extractDir, pluginDir ) }" && zip -r "${ newZipPath }" .`
						);

						// Replace the original zip file
						await fsPromises.unlink( zipPath );
						await fsPromises.rename( newZipPath, zipPath );

						console.log( `[Wizard Hat] Repackaged ZIP file created: ${ zipPath }` );

						// Verify the new zip contents
						const { stdout: newZipContents } = await execAsync( `unzip -l "${ zipPath }"` );
						console.log( `[Wizard Hat] New ZIP file contents:\n${ newZipContents }` );
					} else {
						console.warn( `[Wizard Hat] Could not find plugin directory in extracted contents` );
					}

					// Clean up extraction directory
					await fsPromises.rm( extractDir, { recursive: true, force: true } );
				}
			}
		} catch ( debugError ) {
			console.warn( `[Wizard Hat] Could not inspect ZIP contents:`, debugError );
		}

		// Install the ZIP file via WP-CLI
		console.log( `[Wizard Hat] Installing via WP-CLI: plugin install ${ zipPath } --activate` );

		// Copy the zip file to the WordPress directory since WP-CLI runs in PHP-WASM
		// and can't access the temp directory directly
		const wpZipPath = nodePath.join( server.details.path, `${ pluginName }.zip` );
		console.log( `[Wizard Hat] Copying zip file to WordPress directory: ${ wpZipPath }` );
		await fsPromises.copyFile( zipPath, wpZipPath );

		// Use relative path for WP-CLI
		const relativeZipPath = `${ pluginName }.zip`;
		console.log( `[Wizard Hat] Using relative path for WP-CLI: ${ relativeZipPath }` );

		const result = await server.executeWpCliCommand(
			`plugin install ${ relativeZipPath } --activate`
		);

		console.log( `[Wizard Hat] WP-CLI result:`, {
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
		} );

		if ( result.exitCode !== 0 ) {
			throw new Error( `WP-CLI installation failed: ${ result.stderr }` );
		}

		console.log( `[Wizard Hat] Plugin installed successfully!` );
		return { success: true };
	} catch ( error ) {
		const errorMessage = error instanceof Error ? error.message : String( error );
		console.error( `[Wizard Hat] Error installing plugin ${ pluginName }:`, error );
		return { success: false, error: errorMessage };
	} finally {
		// Clean up temporary files
		console.log( `[Wizard Hat] Cleaning up temporary files...` );
		try {
			await fsPromises.rm( tempDir, { recursive: true, force: true } );
			await fsPromises.unlink( zipPath ).catch( () => {} ); // Ignore if file doesn't exist

			// Clean up the copied zip file in WordPress directory
			const wpZipPath = nodePath.join( server.details.path, `${ pluginName }.zip` );
			await fsPromises.unlink( wpZipPath ).catch( () => {} ); // Ignore if file doesn't exist

			console.log( `[Wizard Hat] Cleanup completed` );
		} catch ( cleanupError ) {
			console.error( '[Wizard Hat] Cleanup error:', cleanupError );
		}
	}
}

export async function validateGitHubToken(
	_event: IpcMainInvokeEvent,
	token: string
): Promise< { valid: boolean; user?: string; error?: string } > {
	try {
		if ( ! token || token.length === 0 ) {
			return { valid: false, error: 'Token is empty' };
		}

		// Test the GitHub API to validate the token
		const response = await fetch( 'https://api.github.com/user', {
			headers: {
				Authorization: `token ${ token }`,
				Accept: 'application/vnd.github.v3+json',
			},
		} );

		if ( response.ok ) {
			const userData = await response.json();
			console.log( 'GitHub token validated for user:', userData.login );
			return { valid: true, user: userData.login };
		} else {
			console.error( 'GitHub token validation failed:', response.status, response.statusText );
			return {
				valid: false,
				error: `Token validation failed: ${ response.status } ${ response.statusText }`,
			};
		}
	} catch ( error ) {
		console.error( 'GitHub token validation error:', error );
		return { valid: false, error: error instanceof Error ? error.message : String( error ) };
	}
}

export async function getAvailablePremiumPlugins(
	_event: IpcMainInvokeEvent,
	githubToken: string
): Promise< {
	success: boolean;
	plugins?: Array< { name: string; label: string } >;
	error?: string;
} > {
	try {
		// Validate token first
		const tokenValidation = await validateGitHubToken( _event, githubToken );
		if ( ! tokenValidation.valid ) {
			return { success: false, error: tokenValidation.error || 'Invalid GitHub token' };
		}

		// Fetch plugins from the repository

		const response = await fetch(
			'https://api.github.com/repos/woocommerce/all-plugins/contents/product-packages',
			{
				headers: {
					Authorization: `token ${ githubToken }`,
					Accept: 'application/vnd.github.v3+json',
					'User-Agent': 'WooCommerce-Studio',
				},
			}
		);

		if ( ! response.ok ) {
			return {
				success: false,
				error: `GitHub API error: ${ response.status } ${ response.statusText }`,
			};
		}

		const contents = ( await response.json() ) as any[];

		const plugins: Array< { name: string; label: string } > = [];

		for ( const item of contents ) {
			if ( item.type === 'dir' && item.name !== 'woocommerce-shipstation' ) {
				const pluginName = item.name;
				// Convert plugin name to a more readable label
				const label = pluginName
					.split( '-' )
					.map( ( word: string ) => word.charAt( 0 ).toUpperCase() + word.slice( 1 ) )
					.join( ' ' );
				plugins.push( { name: pluginName, label } );
			}
		}

		return { success: true, plugins };
	} catch ( error ) {
		console.error( 'Error fetching premium plugins:', error );
		return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
	}
}

export async function importWooCommerceBlueprint(
	_event: IpcMainInvokeEvent,
	{
		siteId,
		blueprintPath,
		githubToken,
	}: {
		siteId: string;
		blueprintPath: string;
		githubToken?: string;
	}
): Promise< {
	success: boolean;
	error?: string;
	results?: Array< { step: string; success: boolean; message: string } >;
} > {
	try {
		const site = SiteServer.get( siteId );
		if ( ! site ) {
			return { success: false, error: 'Site not found' };
		}

		// Ensure site is running
		if ( ! site.details.running ) {
			await site.start();
		}

		// Read and parse the blueprint file
		const blueprintContent = await fsPromises.readFile( blueprintPath, 'utf8' );
		const blueprint = JSON.parse( blueprintContent );

		if ( ! blueprint.steps || ! Array.isArray( blueprint.steps ) ) {
			return { success: false, error: 'Invalid blueprint format: missing or invalid steps array' };
		}

		const results: Array< { step: string; success: boolean; message: string } > = [];

		// Process each step in the blueprint
		for ( const step of blueprint.steps ) {
			try {
				switch ( step.step ) {
					case 'installPlugin':
						await processInstallPluginStep( _event, site, step, githubToken, results );
						break;
					case 'installTheme':
						await processInstallThemeStep( _event, site, step, results );
						break;
					case 'setSiteOptions':
						await processSetSiteOptionsStep( _event, site, step, results );
						break;
					case 'runSql':
						await processRunSqlStep( _event, site, step, results );
						break;
					default:
						results.push( {
							step: step.step,
							success: false,
							message: `Unsupported step type: ${ step.step }`,
						} );
				}
			} catch ( error ) {
				results.push( {
					step: step.step,
					success: false,
					message: error instanceof Error ? error.message : 'Unknown error',
				} );
			}
		}

		const allSuccessful = results.every( ( result ) => result.success );
		return {
			success: allSuccessful,
			results,
			error: allSuccessful ? undefined : 'Some steps failed during import',
		};
	} catch ( error ) {
		console.error( 'Error importing blueprint:', error );
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

async function processInstallPluginStep(
	event: IpcMainInvokeEvent,
	site: SiteServer,
	step: any,
	githubToken: string | undefined,
	results: Array< { step: string; success: boolean; message: string } >
) {
	const pluginData = step.pluginData;
	const options = step.options || {};

	if ( pluginData.resource === 'wordpress.org/plugins' ) {
		// WordPress.org plugin
		const result = await executeWPCLiInline( event, {
			siteId: site.details.id,
			args: `plugin install ${ pluginData.slug } --activate=${ options.activate ? 'yes' : 'no' }`,
		} );

		if ( result.exitCode === 0 ) {
			results.push( {
				step: 'installPlugin',
				success: true,
				message: `Successfully installed WordPress.org plugin: ${ pluginData.slug }`,
			} );
		} else {
			results.push( {
				step: 'installPlugin',
				success: false,
				message: `Failed to install WordPress.org plugin ${ pluginData.slug }: ${ result.stderr }`,
			} );
		}
	} else if ( pluginData.resource === 'self/plugins' ) {
		// Premium plugin from WooCommerce repository
		if ( ! githubToken ) {
			results.push( {
				step: 'installPlugin',
				success: false,
				message: `GitHub token required for premium plugin: ${ pluginData.slug }`,
			} );
			return;
		}

		const installResult = await installPluginFromPrivateRepo( event, {
			siteId: site.details.id,
			repositoryUrl: 'https://github.com/woocommerce/all-plugins',
			githubToken,
			pluginName: pluginData.slug,
		} );

		if ( installResult.success ) {
			results.push( {
				step: 'installPlugin',
				success: true,
				message: `Successfully installed premium plugin: ${ pluginData.slug }`,
			} );
		} else {
			results.push( {
				step: 'installPlugin',
				success: false,
				message: `Failed to install premium plugin ${ pluginData.slug }: ${ installResult.error }`,
			} );
		}
	} else {
		results.push( {
			step: 'installPlugin',
			success: false,
			message: `Unsupported plugin resource type: ${ pluginData.resource }`,
		} );
	}
}

async function processInstallThemeStep(
	event: IpcMainInvokeEvent,
	site: SiteServer,
	step: any,
	results: Array< { step: string; success: boolean; message: string } >
) {
	const themeData = step.themeData;
	const options = step.options || {};

	if ( themeData.resource === 'wordpress.org/themes' ) {
		const result = await executeWPCLiInline( event, {
			siteId: site.details.id,
			args: `theme install ${ themeData.slug } --activate=${ options.activate ? 'yes' : 'no' }`,
		} );

		if ( result.exitCode === 0 ) {
			results.push( {
				step: 'installTheme',
				success: true,
				message: `Successfully installed theme: ${ themeData.slug }`,
			} );
		} else {
			results.push( {
				step: 'installTheme',
				success: false,
				message: `Failed to install theme ${ themeData.slug }: ${ result.stderr }`,
			} );
		}
	} else {
		results.push( {
			step: 'installTheme',
			success: false,
			message: `Unsupported theme resource type: ${ themeData.resource }`,
		} );
	}
}

async function processSetSiteOptionsStep(
	event: IpcMainInvokeEvent,
	site: SiteServer,
	step: any,
	results: Array< { step: string; success: boolean; message: string } >
) {
	const options = step.options;
	let successCount = 0;
	let totalCount = 0;

	for ( const [ optionName, optionValue ] of Object.entries( options ) ) {
		totalCount++;
		try {
			let result;

			if ( Array.isArray( optionValue ) ) {
				// For arrays (including empty arrays), use --format=json to let WordPress handle serialization
				const jsonValue = JSON.stringify( optionValue );
				console.log(
					`[Wizard Hat] Setting option ${ optionName } with JSON value: ${ jsonValue }`
				);

				result = await executeWPCLiInline( event, {
					siteId: site.details.id,
					args: `option set ${ optionName } '${ jsonValue }' --format=json`,
				} );
			} else if ( typeof optionValue === 'object' && optionValue !== null ) {
				// For objects (but not arrays), use --format=json to let WordPress handle serialization
				const jsonValue = JSON.stringify( optionValue );
				console.log(
					`[Wizard Hat] Setting option ${ optionName } with JSON value: ${ jsonValue }`
				);

				result = await executeWPCLiInline( event, {
					siteId: site.details.id,
					args: `option set ${ optionName } '${ jsonValue }' --format=json`,
				} );
			} else {
				// For primitive values, escape and use regular option set
				const valueString = String( optionValue );
				const escapedValue = valueString.replace( /'/g, "'\"'\"'" );

				console.log( `[Wizard Hat] Setting option ${ optionName } with value: ${ valueString }` );

				result = await executeWPCLiInline( event, {
					siteId: site.details.id,
					args: `option set ${ optionName } '${ escapedValue }'`,
				} );
			}

			if ( result.exitCode === 0 ) {
				successCount++;
				console.log( `[Wizard Hat] Successfully set option ${ optionName }` );
			} else {
				console.error( `[Wizard Hat] Failed to set option ${ optionName }: ${ result.stderr }` );
			}
		} catch ( error ) {
			console.error( `[Wizard Hat] Error setting option ${ optionName }:`, error );
		}
	}

	if ( successCount === totalCount ) {
		results.push( {
			step: 'setSiteOptions',
			success: true,
			message: `Successfully set ${ successCount } site options`,
		} );
	} else {
		results.push( {
			step: 'setSiteOptions',
			success: false,
			message: `Set ${ successCount }/${ totalCount } site options successfully`,
		} );
	}
}

async function processRunSqlStep(
	event: IpcMainInvokeEvent,
	site: SiteServer,
	step: any,
	results: Array< { step: string; success: boolean; message: string } >
) {
	const sql = step.sql;

	if ( sql.resource === 'literal' && sql.contents ) {
		try {
			// Convert MySQL-specific SQL to SQLite-compatible SQL
			const sqliteCompatibleSql = convertMySqlToSqlite( sql.contents );

			console.log( `[Wizard Hat] Original SQL: ${ sql.contents }` );
			console.log( `[Wizard Hat] SQLite-compatible SQL: ${ sqliteCompatibleSql }` );

			// Create a temporary SQL file in the site directory
			const tempSqlFile = nodePath.join( site.details.path, `blueprint-sql-${ Date.now() }.sql` );

			try {
				// Write SQL to temporary file
				await fs.promises.writeFile( tempSqlFile, sqliteCompatibleSql, 'utf8' );

				console.log( `[Wizard Hat] SQL written to temporary file: ${ tempSqlFile }` );

				// Execute SQL using Studio's native SQLite import command
				// This is the same approach used by Studio's database import functionality
				const result = await executeWPCLiInline( event, {
					siteId: site.details.id,
					args: `sqlite import ${ nodePath.basename(
						tempSqlFile
					) } --require=/tmp/sqlite-command/command.php`,
					skipPluginsAndThemes: true,
				} );

				if ( result.exitCode === 0 ) {
					results.push( {
						step: 'runSql',
						success: true,
						message: `Successfully executed SQL: ${ sql.name || 'unnamed query' }`,
					} );
				} else {
					console.error( `[Wizard Hat] SQL execution failed:`, result.stderr );
					results.push( {
						step: 'runSql',
						success: false,
						message: `Failed to execute SQL ${ sql.name || 'unnamed query' }: ${ result.stderr }`,
					} );
				}
			} finally {
				// Clean up temporary file
				try {
					await fs.promises.unlink( tempSqlFile );
				} catch ( cleanupError ) {
					console.warn( `[Wizard Hat] Failed to cleanup temp SQL file:`, cleanupError );
				}
			}
		} catch ( error ) {
			console.error( `[Wizard Hat] Error processing SQL:`, error );
			results.push( {
				step: 'runSql',
				success: false,
				message: `Error processing SQL ${ sql.name || 'unnamed query' }: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			} );
		}
	} else {
		results.push( {
			step: 'runSql',
			success: false,
			message: `Unsupported SQL resource type: ${ sql.resource }`,
		} );
	}
}

// MySQL Credentials Management
export async function saveMySQLCredentials(
	_event: IpcMainInvokeEvent,
	credentials: {
		host: string;
		port: string;
		username: string;
		password: string;
	}
): Promise< void > {
	try {
		await lockAppdata();
		const userData = await loadUserData();
		userData.mysqlCredentials = credentials;
		await saveUserData( userData );
	} finally {
		await unlockAppdata();
	}
}

export async function getMySQLCredentials( _event: IpcMainInvokeEvent ): Promise< {
	host: string;
	port: string;
	username: string;
	password: string;
} | null > {
	try {
		const userData = await loadUserData();
		return userData.mysqlCredentials || null;
	} catch ( error ) {
		console.error( 'Error loading MySQL credentials:', error );
		return null;
	}
}

export async function hasMySQLConfiguration(
	_event: IpcMainInvokeEvent,
	siteId: string
): Promise< boolean > {
	try {
		const server = SiteServer.get( siteId );
		if ( ! server ) {
			return false;
		}

		// Check if the site has MySQL configuration by looking for MySQL-specific files
		// or configuration in the site directory
		const wpConfigPath = nodePath.join( server.details.path, 'wp-config.php' );
		if ( ! ( await fsExtra.pathExists( wpConfigPath ) ) ) {
			return false;
		}

		const wpConfigContent = await fsExtra.readFile( wpConfigPath, 'utf8' );
		
		// Check for MySQL database configuration
		const hasMySQLConfig = wpConfigContent.includes( 'DB_HOST' ) && 
							  wpConfigContent.includes( 'DB_NAME' ) && 
							  wpConfigContent.includes( 'DB_USER' ) && 
							  wpConfigContent.includes( 'DB_PASSWORD' );

		return hasMySQLConfig;
	} catch ( error ) {
		console.error( 'Error checking MySQL configuration:', error );
		return false;
	}
}

export async function clearMySQLCredentials( _event: IpcMainInvokeEvent ): Promise< void > {
	try {
		await lockAppdata();
		const userData = await loadUserData();
		delete userData.mysqlCredentials;
		await saveUserData( userData );
	} finally {
		await unlockAppdata();
	}
}

export async function testMySQLConnection(
	_event: IpcMainInvokeEvent,
	credentials: {
		host: string;
		port: string;
		username: string;
		password: string;
	}
): Promise< { success: boolean; message: string } > {
	return testMySQLConnectionLib( credentials );
}
