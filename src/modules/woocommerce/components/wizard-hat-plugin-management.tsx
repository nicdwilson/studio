import { Button, Card, CheckboxControl, Spinner, TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSiteDetails } from 'src/hooks/use-site-details';
import { getIpcApi } from 'src/lib/get-ipc-api';
import { RepositorySetup } from './repository-setup';

interface PluginOption {
	label: string;
	value: string;
	type: 'public' | 'premium';
	repository?: string;
}

// Quick Install plugins (WordPress.org)
const QUICK_INSTALL_PLUGINS: PluginOption[] = [
	{ label: 'WooCommerce', value: 'woocommerce', type: 'public' },
	{ label: 'WooCommerce Payments', value: 'woocommerce-payments', type: 'public' },
	{ label: 'WooCommerce Gateway Stripe', value: 'woocommerce-gateway-stripe', type: 'public' },
	{ label: 'WooCommerce PayPal Payments', value: 'woocommerce-paypal-payments', type: 'public' },
	{ label: 'WooCommerce Square', value: 'woocommerce-square', type: 'public' },
	{ label: 'WP Crontrol', value: 'wp-crontrol', type: 'public' },
];

// Quick Install marketplace plugins
const QUICK_INSTALL_MARKETPLACE_PLUGINS: PluginOption[] = [
	{
		label: 'WooCommerce Subscriptions',
		value: 'woocommerce-subscriptions',
		type: 'premium',
		repository: 'https://github.com/woocommerce/all-plugins',
	},
	{
		label: 'AutomateWoo',
		value: 'automatewoo',
		type: 'premium',
		repository: 'https://github.com/woocommerce/all-plugins',
	},
];

export function WizardHatPluginManagement() {
	const { __ } = useI18n();
	const { selectedSite } = useSiteDetails();
	const { startServer, loadingServer } = useSiteDetails();
	const [ selectedPlugins, setSelectedPlugins ] = useState< string[] >( [] );
	const [ installing, setInstalling ] = useState( false );
	const [ installationLog, setInstallationLog ] = useState< string[] >( [] );

	// Repository path functionality
	const [ repositoryPath, setRepositoryPath ] = useState< string | null >( null );
	const [ showRepositorySetup, setShowRepositorySetup ] = useState( false );
	const [ allPremiumPlugins, setAllPremiumPlugins ] = useState< PluginOption[] >( [] );
	const [ loadingPremiumPlugins, setLoadingPremiumPlugins ] = useState( false );
	const [ searchTerm, setSearchTerm ] = useState( '' );
	const [ showSearchResults, setShowSearchResults ] = useState( false );
	const searchRef = useRef< HTMLDivElement >( null );

	// Click outside handler to close search results
	useEffect( () => {
		const handleClickOutside = ( event: MouseEvent ) => {
			if ( searchRef.current && ! searchRef.current.contains( event.target as Node ) ) {
				setShowSearchResults( false );
			}
		};

		document.addEventListener( 'mousedown', handleClickOutside );
		return () => {
			document.removeEventListener( 'mousedown', handleClickOutside );
		};
	}, [] );

	// Load repository path on mount
	useEffect( () => {
		void checkRepositoryPath();
	}, [] );

	const checkRepositoryPath = async () => {
		try {
			// Ensure IPC API is available
			if ( ! window.ipcApi ) {
				console.warn( 'IPC API not available yet' );
				return;
			}
			const result = await getIpcApi().getRepositoryPath();
			if ( result.configured && result.path ) {
				setRepositoryPath( result.path );
				void loadPremiumPlugins( result.path );
			} else {
				setRepositoryPath( null );
			}
		} catch ( error ) {
			console.error( 'Error checking repository path:', error );
			setRepositoryPath( null );
		}
	};

	const loadPremiumPlugins = async ( repoPath: string ) => {
		setLoadingPremiumPlugins( true );
		try {
			const result = await getIpcApi().getAvailablePluginsFromRepository( repoPath );

			if ( result.success && result.plugins ) {
				const premiumOptions: PluginOption[] = result.plugins.map( ( plugin ) => ( {
					label: plugin.label,
					value: plugin.name,
					type: 'premium' as const,
					repository: 'https://github.com/woocommerce/all-plugins',
				} ) );

				setAllPremiumPlugins( premiumOptions );
			} else {
				setAllPremiumPlugins( [] );
			}
		} catch ( error ) {
			console.error( 'Error loading premium plugins:', error );
			setAllPremiumPlugins( [] );
		} finally {
			setLoadingPremiumPlugins( false );
		}
	};

	const handleInstallOrUpdateClick = () => {
		if ( ! repositoryPath ) {
			setShowRepositorySetup( true );
		}
	};

	if ( ! selectedSite ) {
		return (
			<div className="space-y-8">
				<div className="max-w-3xl px-8">
					<h2 className="text-xl font-semibold text-gray-900 mb-4">
						{ __( 'Plugin Management' ) }
					</h2>
					<p className="text-gray-600 mb-6">{ __( 'Please select a site to manage plugins.' ) }</p>
				</div>
			</div>
		);
	}

	const isLoading = selectedSite?.id ? loadingServer[ selectedSite.id ] : false;

	const togglePlugin = ( pluginValue: string ) => {
		setSelectedPlugins( ( prev ) =>
			prev.includes( pluginValue )
				? prev.filter( ( p ) => p !== pluginValue )
				: [ ...prev, pluginValue ]
		);
	};

	const removePlugin = ( pluginValue: string ) => {
		setSelectedPlugins( ( prev ) => prev.filter( ( p ) => p !== pluginValue ) );
	};

	// Filter premium plugins based on search term
	const filteredPremiumPlugins = useMemo( () => {
		if ( searchTerm.length < 3 ) {
			return [];
		}

		const term = searchTerm.toLowerCase();
		return allPremiumPlugins
			.filter(
				( plugin ) =>
					plugin.label.toLowerCase().includes( term ) || plugin.value.toLowerCase().includes( term )
			)
			.filter( ( plugin ) => ! selectedPlugins.includes( plugin.value ) );
	}, [ searchTerm, allPremiumPlugins, selectedPlugins ] );

	const handleSearchChange = useCallback(
		( value: string ) => {
			setSearchTerm( value );
			if ( value.length >= 3 ) {
				setShowSearchResults( true );
			} else {
				setShowSearchResults( false );
			}
		},
		[ allPremiumPlugins.length, loadingPremiumPlugins ]
	);

	const addPremiumPluginFromSearch = ( pluginValue: string ) => {
		if ( ! selectedPlugins.includes( pluginValue ) ) {
			setSelectedPlugins( ( prev ) => [ ...prev, pluginValue ] );
			setSearchTerm( '' );
			setShowSearchResults( false );
		}
	};

	const installSelectedPlugins = async () => {
		if ( selectedPlugins.length === 0 ) return;

		// Check if repository path is configured for premium plugins
		const premiumPluginsToInstall = [
			...QUICK_INSTALL_MARKETPLACE_PLUGINS,
			...allPremiumPlugins,
		].filter( ( plugin ) => selectedPlugins.includes( plugin.value ) );

		if ( premiumPluginsToInstall.length > 0 && ! repositoryPath ) {
			setShowRepositorySetup( true );
			return;
		}

		setInstalling( true );
		setInstallationLog( [] );

		try {
			// Ensure site is running
			if ( ! selectedSite.running ) {
				await startServer( selectedSite.id );
			}

			const allPlugins = [
				...QUICK_INSTALL_PLUGINS,
				...QUICK_INSTALL_MARKETPLACE_PLUGINS,
				...allPremiumPlugins,
			];
			const pluginsToInstall = allPlugins.filter( ( plugin ) =>
				selectedPlugins.includes( plugin.value )
			);

			setInstallationLog( ( prev ) => [
				...prev,
				`🚀 Starting installation of ${ pluginsToInstall.length } plugins...`,
			] );

			const results = {
				success: [] as string[],
				failed: [] as Array< { plugin: string; error: string } >,
			};

			for ( const plugin of pluginsToInstall ) {
				try {
					setInstallationLog( ( prev ) => [ ...prev, `📦 Installing ${ plugin.label }...` ] );

					if ( plugin.type === 'premium' ) {
						if ( ! repositoryPath ) {
							throw new Error( 'Repository path not configured for premium plugins' );
						}

						const result = await getIpcApi().installPluginFromLocalRepo( {
							siteId: selectedSite.id,
							repositoryPath: repositoryPath!,
							pluginName: plugin.value,
						} );

						if ( ! result.success ) {
							throw new Error( result.error || 'Failed to install premium plugin' );
						}

						results.success.push( plugin.label );
						setInstallationLog( ( prev ) => [
							...prev,
							`✅ ${ plugin.label } installed successfully`,
						] );
					} else {
						const result = await getIpcApi().executeWPCLiInline( {
							siteId: selectedSite.id,
							args: `plugin install ${ plugin.value } --activate`,
						} );

						if ( result.exitCode === 0 ) {
							results.success.push( plugin.label );
							setInstallationLog( ( prev ) => [
								...prev,
								`✅ ${ plugin.label } installed successfully`,
							] );
						} else {
							results.failed.push( { plugin: plugin.label, error: result.stderr } );
							setInstallationLog( ( prev ) => [
								...prev,
								`❌ ${ plugin.label } failed: ${ result.stderr }`,
							] );
						}
					}
				} catch ( error ) {
					console.error( `Error installing ${ plugin.label }:`, error );
					results.failed.push( {
						plugin: plugin.label,
						error: error instanceof Error ? error.message : String( error ),
					} );
					setInstallationLog( ( prev ) => [
						...prev,
						`❌ ${ plugin.label } failed: ${
							error instanceof Error ? error.message : String( error )
						}`,
					] );
				}
			}

			// Show final results
			if ( results.success.length > 0 ) {
				setInstallationLog( ( prev ) => [
					...prev,
					`\n✅ Successfully installed: ${ results.success.join( ', ' ) }`,
				] );
			}
			if ( results.failed.length > 0 ) {
				setInstallationLog( ( prev ) => [
					...prev,
					`\n❌ Failed to install: ${ results.failed.map( ( f ) => f.plugin ).join( ', ' ) }`,
				] );
			}
		} catch ( error ) {
			console.error( 'Error during plugin installation:', error );
			setInstallationLog( ( prev ) => [
				...prev,
				`❌ Installation failed: ${ error instanceof Error ? error.message : String( error ) }`,
			] );
		} finally {
			setInstalling( false );
		}
	};

	return (
		<>
			<RepositorySetup
				isOpen={ showRepositorySetup }
				onClose={ async () => {
					setShowRepositorySetup( false );
					await checkRepositoryPath();
				} }
			/>

		<div className="space-y-8">
			<div className="max-w-3xl px-8">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">{ __( 'Plugin Management' ) }</h2>
				<p className="text-gray-600 mb-6">
					{ __(
							'Install and manage WooCommerce plugins. Configure your local all-plugins repository path to install marketplace plugins.'
					) }
				</p>
			</div>

			{ /* Quick Install Section */ }
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">{ __( 'Quick Install' ) }</h3>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
					{ QUICK_INSTALL_PLUGINS.map( ( plugin ) => (
						<CheckboxControl
							key={ plugin.value }
							label={ plugin.label }
							checked={ selectedPlugins.includes( plugin.value ) }
							onChange={ () => togglePlugin( plugin.value ) }
						/>
					) ) }
					{ QUICK_INSTALL_MARKETPLACE_PLUGINS.map( ( plugin ) => (
						<CheckboxControl
							key={ plugin.value }
							label={ plugin.label }
							checked={ selectedPlugins.includes( plugin.value ) }
								onChange={ () => {
									if ( ! repositoryPath ) {
										setShowRepositorySetup( true );
									} else {
										togglePlugin( plugin.value );
									}
								} }
								disabled={ ! repositoryPath }
						/>
					) ) }
				</div>
					{ ! repositoryPath && (
					<p className="text-sm text-gray-500 mt-2">
							{ __(
								'Configure your local all-plugins repository path to install marketplace plugins. Click on a marketplace plugin to set it up.'
							) }
					</p>
				) }
			</Card>

			{ /* Marketplace Section */ }
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">{ __( 'Marketplace' ) }</h3>

					{ repositoryPath ? (
					<div className="space-y-4" ref={ searchRef }>
						<TextControl
							label={ __( 'Search plugins (type 3+ characters)' ) }
							value={ searchTerm }
							onChange={ handleSearchChange }
							placeholder={ __( 'Search for marketplace plugins...' ) }
							disabled={ loadingPremiumPlugins }
							onFocus={ () => {
								if ( searchTerm.length >= 3 ) {
									setShowSearchResults( true );
								}
							} }
						/>

						{ /* Search Results */ }
						{ showSearchResults && (
							<div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto bg-white shadow-lg">
								{ filteredPremiumPlugins.length > 0 ? (
									<div className="divide-y divide-gray-100">
										{ filteredPremiumPlugins.map( ( plugin ) => (
											<div
												key={ plugin.value }
												className="flex items-center justify-between p-3 hover:bg-blue-50 cursor-pointer transition-colors"
												onClick={ () => addPremiumPluginFromSearch( plugin.value ) }
											>
												<div className="flex-1">
													<div className="font-medium text-gray-900">{ plugin.label }</div>
													<div className="text-sm text-gray-500">{ plugin.value }</div>
												</div>
												<Button
													variant="tertiary"
													size="small"
													onClick={ ( e: React.MouseEvent ) => {
														e.stopPropagation();
														addPremiumPluginFromSearch( plugin.value );
													} }
												>
													{ __( 'Add' ) }
												</Button>
											</div>
										) ) }
									</div>
								) : searchTerm.length >= 3 ? (
									<div className="p-4 text-center text-gray-500">
										{ __( 'No plugins found matching your search.' ) }
									</div>
								) : null }
							</div>
						) }

						{ loadingPremiumPlugins && (
							<div className="flex items-center gap-2 text-sm text-gray-600">
								<Spinner />
								{ __( 'Loading marketplace plugins...' ) }
							</div>
						) }

						{ ! loadingPremiumPlugins && allPremiumPlugins.length > 0 && (
							<div className="text-sm text-gray-500">
								{ __( 'Available marketplace plugins:' ) } { allPremiumPlugins.length }
							</div>
						) }

							{ ! loadingPremiumPlugins && allPremiumPlugins.length === 0 && (
								<div className="text-sm text-gray-500">
									{ __( 'No marketplace plugins found in repository.' ) }
							</div>
						) }
					</div>
				) : (
					<div className="text-center py-8">
						<p className="text-gray-600 mb-4">
								{ __(
									'Configure your local all-plugins repository path to access the marketplace.'
								) }
						</p>
							<Button variant="secondary" onClick={ () => setShowRepositorySetup( true ) }>
								{ __( 'Configure Repository Path' ) }
						</Button>
					</div>
				) }
			</Card>

			{ /* Selected Plugins List */ }
			{ selectedPlugins.length > 0 && (
				<Card className="p-6">
					<h3 className="text-lg font-medium text-gray-900 mb-4">
						{ __( 'Selected Plugins' ) } ({ selectedPlugins.length })
					</h3>
					<div className="space-y-2">
						{ selectedPlugins.map( ( pluginValue ) => {
							const allPlugins = [
								...QUICK_INSTALL_PLUGINS,
								...QUICK_INSTALL_MARKETPLACE_PLUGINS,
								...allPremiumPlugins,
							];
							const plugin = allPlugins.find( ( p ) => p.value === pluginValue );
							return (
								<div
									key={ pluginValue }
									className="flex items-center justify-between p-2 bg-gray-50 rounded"
								>
									<span className="text-sm">
										{ plugin?.label || pluginValue }
										{ plugin?.type === 'premium' && (
											<span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
												{ __( 'Premium' ) }
											</span>
										) }
									</span>
									<Button
										variant="tertiary"
										size="small"
										onClick={ () => removePlugin( pluginValue ) }
									>
										{ __( 'Remove' ) }
									</Button>
								</div>
							);
						} ) }
					</div>

					<div className="mt-4">
						<Button
							variant="primary"
							onClick={ installSelectedPlugins }
							disabled={ isLoading || installing }
							className="w-full"
						>
							{ installing ? (
								<div className="flex items-center gap-2">
									<Spinner />
									{ __( 'Installing...' ) }
								</div>
							) : (
								__( 'Install Selected Plugins' )
							) }
						</Button>
					</div>
				</Card>
			) }

			{ /* Installation Log */ }
			{ installationLog.length > 0 && (
				<Card className="p-6">
					<h3 className="text-lg font-medium text-gray-900 mb-4">{ __( 'Installation Log' ) }</h3>
					<div className="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto">
						<pre className="text-sm text-gray-800 whitespace-pre-wrap">
							{ installationLog.join( '\n' ) }
						</pre>
					</div>
				</Card>
			) }

			{ /* Information Section */ }
			<div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
				<h3 className="text-lg font-medium text-blue-900 mb-2">
					{ __( 'Plugin Installation Information' ) }
				</h3>
				<ul className="text-blue-800 space-y-2">
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>
							{ __( 'WordPress.org plugins are installed from the official repository' ) }
						</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>
								{ __(
									'Marketplace plugins require a local clone of the all-plugins repository (configure on first use)'
								) }
						</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{ __( 'All plugins will be installed and activated automatically' ) }</span>
					</li>
				</ul>
			</div>
		</div>
		</>
	);
}
