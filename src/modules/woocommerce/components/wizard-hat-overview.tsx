import { Card, Button, Icon } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { cog, archive, pencil, page, download, help, info } from '@wordpress/icons';
import { useI18n } from '@wordpress/react-i18n';
import { useState, useEffect } from 'react';
import { ButtonsSection, ButtonsSectionProps } from 'src/components/buttons-section';
import { useSiteDetails } from 'src/hooks/use-site-details';
import { getIpcApi } from 'src/lib/get-ipc-api';

export function WizardHatOverview() {
	const { __ } = useI18n();
	const { selectedSite } = useSiteDetails();
	const [ isHPOS, setIsHPOS ] = useState< boolean | null >( null );
	const [ isLoadingHPOS, setIsLoadingHPOS ] = useState( false );

	// Detect HPOS status
	useEffect( () => {
		const detectHPOS = async () => {
			if ( ! selectedSite?.running ) {
				setIsHPOS( null );
				return;
			}

			setIsLoadingHPOS( true );
			try {
				const result = await getIpcApi().executeWPCLiInline( {
					siteId: selectedSite.id,
					args: 'option get woocommerce_custom_orders_table_enabled',
				} );

				// HPOS is enabled if the option returns 'yes'
				setIsHPOS( result.stdout?.trim() === 'yes' );
			} catch ( error ) {
				console.error( 'Error detecting HPOS status:', error );
				// Default to false if we can't detect
				setIsHPOS( false );
			} finally {
				setIsLoadingHPOS( false );
			}
		};

		detectHPOS();
	}, [ selectedSite?.id, selectedSite?.running ] );

	if ( ! selectedSite ) {
		return (
			<div className="space-y-8">
				<div className="max-w-3xl px-8">
					<h2 className="text-xl font-semibold text-gray-900 mb-4">
						{ __( 'Wizard Hat Toolkit' ) }
					</h2>
					<p className="text-gray-600 mb-6">
						{ __( 'Please select a site to use the Wizard Hat Toolkit.' ) }
					</p>
				</div>
			</div>
		);
	}

	const handleWooCommerceClick = ( url: string ) => async () => {
		if ( ! selectedSite.running ) {
			// Start the server if it's not running
			// Note: This would need to be implemented based on your site management logic
		}
		getIpcApi().openSiteURL( selectedSite.id, url );
	};

	const wooCommerceButtons: ButtonsSectionProps[ 'buttonsArray' ] = [
		{
			label: __( 'General Settings' ),
			icon: cog,
			onClick: handleWooCommerceClick( '/wp-admin/admin.php?page=wc-settings' ),
		},
		{
			label: __( 'Products' ),
			icon: archive,
			onClick: handleWooCommerceClick( '/wp-admin/admin.php?page=wc-settings&tab=products' ),
		},
		{
			label: __( 'Payments' ),
			icon: pencil,
			onClick: handleWooCommerceClick( '/wp-admin/admin.php?page=wc-settings&tab=checkout' ),
		},
		{
			label: __( 'Shipping' ),
			icon: page,
			onClick: handleWooCommerceClick( '/wp-admin/admin.php?page=wc-settings&tab=shipping' ),
		},
		{
			label: __( 'Taxes' ),
			icon: download,
			onClick: handleWooCommerceClick( '/wp-admin/admin.php?page=wc-settings&tab=tax' ),
		},
		{
			label: __( 'Emails' ),
			icon: help,
			onClick: handleWooCommerceClick( '/wp-admin/admin.php?page=wc-settings&tab=email' ),
		},
		{
			label: __( 'Accounts & Privacy' ),
			icon: info,
			onClick: handleWooCommerceClick( '/wp-admin/admin.php?page=wc-settings&tab=account' ),
		},
		{
			label: __( 'Advanced' ),
			icon: cog,
			onClick: handleWooCommerceClick( '/wp-admin/admin.php?page=wc-settings&tab=advanced' ),
		},
		{
			label: __( 'Advanced Features' ),
			icon: archive,
			onClick: handleWooCommerceClick(
				'/wp-admin/admin.php?page=wc-settings&tab=advanced&section=features'
			),
		},
		{
			label: __( 'Subscriptions' ),
			icon: pencil,
			onClick: handleWooCommerceClick( '/wp-admin/admin.php?page=wc-settings&tab=subscriptions' ),
		},
	];

	// Create WooCommerce Data buttons based on HPOS status
	const getWooCommerceDataButtons = (): ButtonsSectionProps[ 'buttonsArray' ] => {
		const baseButtons = [
			{
				label: __( 'Products' ),
				icon: archive,
				onClick: handleWooCommerceClick( '/wp-admin/edit.php?post_type=product' ),
			},
			{
				label: __( 'Analytics' ),
				icon: page,
				onClick: handleWooCommerceClick( '/wp-admin/admin.php?page=wc-admin' ),
			},
		];

		// Add orders button based on HPOS status
		if ( isHPOS === true ) {
			// HPOS enabled - use the new orders page
			baseButtons.push( {
				label: __( 'Orders' ),
				icon: pencil,
				onClick: handleWooCommerceClick( '/wp-admin/admin.php?page=wc-orders' ),
			} );
		} else if ( isHPOS === false ) {
			// HPOS disabled - use the traditional orders page
			baseButtons.push( {
				label: __( 'Orders' ),
				icon: pencil,
				onClick: handleWooCommerceClick( '/wp-admin/edit.php?post_type=shop_order' ),
			} );
		}

		// Add subscriptions button (may not be available on all sites)
		baseButtons.push( {
			label: __( 'Subscriptions' ),
			icon: download,
			onClick: handleWooCommerceClick( '/wp-admin/edit.php?post_type=shop_subscription' ),
		} );

		return baseButtons;
	};

	return (
		<div className="space-y-8">
			<div className="max-w-3xl px-8">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">{ __( 'Wizard Hat Toolkit' ) }</h2>
				<p className="text-gray-600 mb-6">
					{ __(
						'A collection of essential tools for Woo Happiness troubleshooting and testing. This toolkit provides utilities for tunneling, shop configuration, plugin management, and more.'
					) }
				</p>
			</div>

			{ /* WooCommerce Settings */ }
			<div className="px-8">
				<ButtonsSection
					buttonsArray={ wooCommerceButtons }
					title={ __( 'WooCommerce Settings' ) }
				/>
			</div>

			{ /* WooCommerce Data */ }
			<div className="px-8">
				<ButtonsSection
					buttonsArray={ getWooCommerceDataButtons() }
					title={ __( 'WooCommerce Data' ) }
				/>
			</div>

			{ /* Site Information */ }
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">{ __( 'Current Site' ) }</h3>
				<div className="space-y-3">
					<div className="flex justify-between">
						<span className="text-gray-600">{ __( 'Site Name' ) }:</span>
						<span className="font-medium">{ selectedSite.name }</span>
					</div>
					<div className="flex justify-between">
						<span className="text-gray-600">{ __( 'Path' ) }:</span>
						<span className="font-medium">{ selectedSite.path }</span>
					</div>
					<div className="flex justify-between">
						<span className="text-gray-600">{ __( 'Status' ) }:</span>
						<span
							className={ `font-medium ${
								selectedSite.running ? 'text-green-600' : 'text-red-600'
							}` }
						>
							{ selectedSite.running ? __( 'Running' ) : __( 'Stopped' ) }
						</span>
					</div>
					{ selectedSite.running && (
						<div className="flex justify-between">
							<span className="text-gray-600">{ __( 'URL' ) }:</span>
							<span className="font-medium">{ selectedSite.url }</span>
						</div>
					) }
				</div>
				{ selectedSite.running && (
					<div className="mt-4 pt-4 border-t border-gray-200">
						<Button
							variant="secondary"
							onClick={ handleWooCommerceClick( '/wp-admin/admin.php?page=wc-status' ) }
							className="w-full"
						>
							{ __( 'View System Status Report' ) }
						</Button>
					</div>
				) }
			</Card>

			{ /* Getting Started */ }
			<div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
				<h3 className="text-lg font-medium text-blue-900 mb-2">{ __( 'Getting Started' ) }</h3>
				<ol className="text-blue-800 space-y-2">
					<li className="flex items-start">
						<span className="font-medium mr-2">1.</span>
						<span>{ __( 'Configure your shop settings for the appropriate locale' ) }</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">2.</span>
						<span>
							{ __( 'Install necessary WooCommerce plugins for your development needs' ) }
						</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">3.</span>
						<span>{ __( 'Use the developer tools for testing and debugging' ) }</span>
					</li>
				</ol>
			</div>
		</div>
	);
}
